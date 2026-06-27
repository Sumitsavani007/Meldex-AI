#!/usr/bin/env node
/* eslint-disable no-console */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.MELDEX_IDE_PROXY_PORT || 3101);
const SESSION_FILE = process.env.MELDEX_IDE_SESSION_FILE || path.join(os.tmpdir(), "meldex-openvscode-sessions.json");

function sessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return {};
  }
}

function cookieMap(header = "") {
  return Object.fromEntries(
    header.split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function proxyCookieName(workspaceId) {
  return `meldex_ide_${workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function resolveSession(reqUrl) {
  const url = new URL(reqUrl, "http://127.0.0.1");
  const match = url.pathname.match(/^\/ide\/([^/]+)(\/.*)?$/);
  if (!match) return { status: 404, error: "IDE route not found" };
  const workspaceId = decodeURIComponent(match[1]);
  const cookies = cookieMap(this?.headers?.cookie || "");
  const token = url.searchParams.get("tkn") || cookies[proxyCookieName(workspaceId)] || "";
  const session = sessions()[workspaceId];
  if (!session || session.token !== token) return { status: 401, error: "Invalid IDE session" };
  if (new Date(session.expiresAt).getTime() <= Date.now()) return { status: 401, error: "IDE session expired" };
  const shouldSetCookie = url.searchParams.has("tkn");
  url.searchParams.delete("tkn");
  return { session, workspaceId, shouldSetCookie, upstreamPath: `${url.pathname}${url.search}` };
}

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(message);
}

function proxyHttp(req, res) {
  const resolved = resolveSession.call(req, req.url);
  if (!resolved.session) return sendError(res, resolved.status, resolved.error);
  const options = {
    host: "127.0.0.1",
    port: resolved.session.port,
    method: req.method,
    path: resolved.upstreamPath,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${resolved.session.port}`,
      "x-forwarded-proto": "https",
      "x-forwarded-host": req.headers.host || "meldex.newsyfly.com",
    },
  };
  const upstream = http.request(options, (upstreamRes) => {
    const headers = { ...upstreamRes.headers };
    delete headers["content-security-policy"];
    if (headers.location?.startsWith("/")) {
      headers.location = `/ide/${encodeURIComponent(resolved.workspaceId)}${headers.location}`;
    }
    if (resolved.shouldSetCookie) {
      const authCookie = `${proxyCookieName(resolved.workspaceId)}=${encodeURIComponent(resolved.session.token)}; Path=/ide/${encodeURIComponent(resolved.workspaceId)}/; HttpOnly; Secure; SameSite=Lax; Max-Age=7200`;
      headers["set-cookie"] = Array.isArray(headers["set-cookie"])
        ? [...headers["set-cookie"], authCookie]
        : headers["set-cookie"]
          ? [headers["set-cookie"], authCookie]
          : [authCookie];
    }
    res.writeHead(upstreamRes.statusCode || 502, headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => sendError(res, 502, `IDE upstream unavailable: ${error.message}`));
  req.pipe(upstream);
}

const server = http.createServer(proxyHttp);

server.on("upgrade", (req, socket, head) => {
  const resolved = resolveSession.call(req, req.url);
  if (!resolved.session) {
    socket.write(`HTTP/1.1 ${resolved.status} Unauthorized\r\nConnection: close\r\n\r\n${resolved.error}`);
    socket.destroy();
    return;
  }
  const upstream = http.request({
    host: "127.0.0.1",
    port: resolved.session.port,
    method: req.method,
    path: resolved.upstreamPath,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${resolved.session.port}`,
      connection: "Upgrade",
      upgrade: req.headers.upgrade || "websocket",
      "x-forwarded-proto": "https",
      "x-forwarded-host": req.headers.host || "meldex.newsyfly.com",
    },
  });
  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Connection: Upgrade",
      `Upgrade: ${req.headers.upgrade || "websocket"}`,
      "\r\n",
    ].join("\r\n"));
    if (upstreamHead?.length) socket.write(upstreamHead);
    if (head?.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});

server.listen(PORT, "127.0.0.1", () => console.log(`Meldex OpenVSCode proxy listening on 127.0.0.1:${PORT}`));
