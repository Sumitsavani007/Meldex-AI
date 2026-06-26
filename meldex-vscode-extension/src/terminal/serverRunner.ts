import * as cp from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as path from "path";
import { isCommandAllowed, LogCallback } from "./processRunner";

export type ProjectKind = "static" | "next" | "vite" | "react" | "node" | "php" | "python" | "unknown";

export interface ServerStatus {
  status: "idle" | "starting" | "running" | "error" | "stopped";
  url?: string;
  port?: number;
  command?: string;
  pid?: number;
  logs: string[];
  error?: string;
  projectKind?: ProjectKind;
  verified?: boolean;
  verification?: string;
}

type PackageJson = { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const READY_PATTERNS = [
  /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i,
  /\blocalhost:\d+/i,
  /\bready\b/i,
  /\bstarted\b/i,
  /\bcompiled\b/i,
  /\blistening\b/i,
  /\bserver running\b/i,
];

const URL_PATTERN = /(https?:\/\/(?:localhost|127\.0\.0\.1):\d+|localhost:\d+)/i;

export class ServerRunner {
  private child: cp.ChildProcess | null = null;
  private current: ServerStatus = { status: "idle", logs: [] };

  constructor(private readonly onLog?: LogCallback) {}

  get status(): ServerStatus {
    return { ...this.current, logs: [...this.current.logs] };
  }

  async start(root: string, preferredPort?: number): Promise<ServerStatus> {
    if (this.child && this.current.status === "running") {
      const healthy = await this.checkReady(this.current.url);
      if (healthy) return this.status;
      this.stop();
    }

    const port = await findFreePort(preferredPort ?? 5173);
    const detected = detectServerCommand(root, port);
    if (!detected.command) {
      this.current = {
        status: "error",
        logs: [],
        error: "No runnable local server command detected.",
        projectKind: detected.projectKind,
      };
      return this.status;
    }

    if (!isCommandAllowed(detected.command)) {
      this.current = {
        status: "error",
        logs: [],
        command: detected.command,
        error: "Server command blocked by safety policy.",
        projectKind: detected.projectKind,
      };
      return this.status;
    }

    const parts = detected.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    const [bin, ...args] = parts;
    if (!bin) {
      this.current = { status: "error", logs: [], error: "Empty server command.", projectKind: detected.projectKind };
      return this.status;
    }

    this.current = {
      status: "starting",
      command: detected.command,
      port: detected.port,
      url: detected.url,
      logs: [],
      projectKind: detected.projectKind,
    };

    try {
      this.child = cp.spawn(bin, args, {
        cwd: root,
        shell: process.platform === "win32",
        env: { ...process.env, PORT: String(detected.port) },
      });
    } catch (error) {
      this.current = { ...this.current, status: "error", error: error instanceof Error ? error.message : String(error) };
      return this.status;
    }

    this.current.pid = this.child.pid;
    this.child.stdout?.on("data", (chunk: Buffer) => this.capture(chunk.toString(), "stdout"));
    this.child.stderr?.on("data", (chunk: Buffer) => this.capture(chunk.toString(), "stderr"));
    this.child.on("close", (code) => {
      if (this.current.status !== "stopped") {
        this.current = {
          ...this.current,
          status: code === 0 ? "stopped" : "error",
          error: code === 0 ? undefined : `Server exited with code ${code ?? 1}`,
        };
      }
      this.child = null;
    });
    this.child.on("error", (error) => {
      this.current = { ...this.current, status: "error", error: error.message };
      this.child = null;
    });

    const ready = await this.waitUntilReady(detected.url, 30000);
    if (ready.ok) {
      const verified = await this.verifyPreview(root, ready.url ?? detected.url);
      this.current = {
        ...this.current,
        status: verified.ok ? "running" : "error",
        url: ready.url ?? detected.url,
        port: portFromUrl(ready.url) ?? detected.port,
        verified: verified.ok,
        verification: verified.message,
        error: verified.ok ? undefined : verified.message,
      };
    } else {
      this.current = { ...this.current, status: "error", error: ready.error ?? "Server did not become ready." };
    }
    return this.status;
  }

  stop(): ServerStatus {
    if (this.child && !this.child.killed) this.child.kill("SIGTERM");
    this.child = null;
    this.current = { ...this.current, status: "stopped" };
    return this.status;
  }

  private capture(text: string, stream: "stdout" | "stderr"): void {
    this.current.logs.push(...text.split(/\r?\n/).filter(Boolean).slice(-30));
    this.current.logs = this.current.logs.slice(-120);
    this.onLog?.(text, stream);
    const match = text.match(URL_PATTERN);
    if (match) {
      const url = normalizeUrl(match[1]);
      this.current.url = url;
      this.current.port = portFromUrl(url) ?? this.current.port;
    }
    if (READY_PATTERNS.some((pattern) => pattern.test(text)) && this.current.status === "starting") {
      this.current = { ...this.current, status: "running" };
    }
  }

  private async waitUntilReady(url: string | undefined, timeoutMs: number): Promise<{ ok: boolean; url?: string; error?: string }> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.current.status === "error") return { ok: false, error: this.current.error };
      const candidate = this.current.url ?? url;
      if (candidate && await this.checkReady(candidate)) return { ok: true, url: candidate };
      if (this.current.status === "running" && candidate) return { ok: true, url: candidate };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { ok: false, error: "Timed out waiting for preview URL." };
  }

  private checkReady(url: string | undefined): Promise<boolean> {
    if (!url) return Promise.resolve(false);
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1500, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private verifyPreview(root: string, url: string | undefined): Promise<{ ok: boolean; message: string }> {
    if (!url) return Promise.resolve({ ok: false, message: "No preview URL detected." });
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 12000) req.destroy();
        });
        res.on("end", () => {
          const statusOk = (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 400;
          const type = String(res.headers["content-type"] ?? "");
          const looksHtml = type.includes("text/html") || /<!doctype html|<html|<body/i.test(body);
          const title = titleFromIndex(root);
          const containsExpected = !title || body.toLowerCase().includes(title.toLowerCase());
          if (statusOk && looksHtml && containsExpected) {
            resolve({ ok: true, message: `HTTP ${res.statusCode} verified HTML preview.` });
          } else {
            resolve({ ok: false, message: `Preview verification failed: HTTP ${res.statusCode}, html=${looksHtml}, content=${containsExpected}.` });
          }
        });
      });
      req.on("error", (error) => resolve({ ok: false, message: error.message }));
      req.setTimeout(2500, () => {
        req.destroy();
        resolve({ ok: false, message: "Preview verification timed out." });
      });
    });
  }
}

export function requestNeedsExecution(task: string): boolean {
  return /\b(run|local server|start|preview|test|check|build|verify|open in browser)\b|chalavi ne bata|run kari ne check kar/i.test(task);
}

export function requestNeedsServer(task: string): boolean {
  return /\b(local server|start|preview|open in browser)\b|chalavi ne bata|run kari ne check kar/i.test(task);
}

export function detectValidationCommands(root: string): string[] {
  const packageJson = readPackage(root);
  const scripts = packageJson?.scripts ?? {};
  const commands: string[] = [];
  const pm = detectPackageManager(root);
  if (scripts.build) commands.push(`${pm} run build`);
  if (scripts.lint) commands.push(`${pm} run lint`);
  if (scripts.test) commands.push(pm === "npm" ? "npm test" : `${pm} test`);
  if (!packageJson && fs.existsSync(path.join(root, "index.html"))) commands.push("node -e \"require('fs').accessSync('index.html')\"");
  return commands;
}

export function detectServerCommand(root: string, preferredPort = 5173): { projectKind: ProjectKind; command?: string; port: number; url?: string } {
  const packageJson = readPackage(root);
  const scripts = packageJson?.scripts ?? {};
  const deps = { ...(packageJson?.dependencies ?? {}), ...(packageJson?.devDependencies ?? {}) };
  const pm = detectPackageManager(root);
  const has = (file: string) => fs.existsSync(path.join(root, file));
  const url = `http://localhost:${preferredPort}`;

  if (has("index.html") && !packageJson) {
    return { projectKind: "static", command: `python3 -m http.server ${preferredPort}`, port: preferredPort, url };
  }
  if (has("next.config.ts") || has("next.config.js") || deps.next) {
    return { projectKind: "next", command: scripts.dev ? `${pm} run dev -- --port ${preferredPort}` : `npx next dev -p ${preferredPort}`, port: preferredPort, url };
  }
  if (has("vite.config.ts") || has("vite.config.js") || deps.vite) {
    return { projectKind: "vite", command: scripts.dev ? `${pm} run dev -- --host localhost --port ${preferredPort}` : `npx vite --host localhost --port ${preferredPort}`, port: preferredPort, url };
  }
  if (deps.react && scripts.dev) return { projectKind: "react", command: `${pm} run dev -- --host localhost --port ${preferredPort}`, port: preferredPort, url };
  if (packageJson && scripts.start) return { projectKind: "node", command: `${pm} start`, port: preferredPort, url };
  if (has("index.php")) return { projectKind: "php", command: `php -S localhost:${preferredPort}`, port: preferredPort, url };
  if (has("app.py")) return { projectKind: "python", command: `python3 app.py`, port: preferredPort, url };
  if (has("index.html")) return { projectKind: "static", command: `python3 -m http.server ${preferredPort}`, port: preferredPort, url };
  return { projectKind: "unknown", port: preferredPort };
}

function detectPackageManager(root: string): string {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
  return "npm";
}

function readPackage(root: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function normalizeUrl(value: string): string {
  return value.startsWith("http") ? value : `http://${value}`;
}

function portFromUrl(value?: string): number | undefined {
  if (!value) return undefined;
  try {
    return Number(new URL(normalizeUrl(value)).port) || undefined;
  } catch {
    return undefined;
  }
}

function findFreePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const tryPort = (port: number) => {
      const server = net.createServer();
      server.unref();
      server.on("error", () => tryPort(port + 1));
      server.listen(port, () => {
        server.close(() => resolve(port));
      });
    };
    tryPort(start);
  });
}

function titleFromIndex(root: string): string | undefined {
  try {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    return html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
  } catch {
    return undefined;
  }
}
