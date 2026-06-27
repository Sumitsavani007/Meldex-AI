import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { findStaticPreviewEntry, getOwnedWorkspaceProject, resolveProjectFile, verifyStaticPreview } from "@/lib/ai-workspace";
import { prisma } from "@/lib/prisma";
import { canUseFeature, featureBlockedResponse } from "@/lib/plans-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["start", "stop", "refresh", "verify"]).default("verify"),
});

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

function isPreviewLocalAsset(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) &&
    !trimmed.startsWith("#") &&
    !trimmed.startsWith("data:") &&
    !trimmed.startsWith("blob:") &&
    !trimmed.startsWith("mailto:") &&
    !trimmed.startsWith("tel:") &&
    !trimmed.startsWith("javascript:") &&
    !/^https?:\/\//i.test(trimmed) &&
    !trimmed.startsWith("/api/workspaces/");
}

function previewAssetUrl(projectId: string, entryPath: string, assetPath: string) {
  const cleanAsset = assetPath.split("#")[0]?.split("?")[0] || "";
  const entryDir = path.posix.dirname(entryPath);
  const relative = cleanAsset.startsWith("/")
    ? cleanAsset.replace(/^\/+/, "")
    : path.posix.join(entryDir === "." ? "" : entryDir, cleanAsset);
  return `/api/workspaces/${projectId}/preview?file=${encodeURIComponent(relative)}`;
}

function resolvePreviewAssetPath(entryPath: string, assetPath: string) {
  const cleanAsset = assetPath.split("#")[0]?.split("?")[0] || "";
  const entryDir = path.posix.dirname(entryPath);
  return cleanAsset.startsWith("/")
    ? cleanAsset.replace(/^\/+/, "")
    : path.posix.join(entryDir === "." ? "" : entryDir, cleanAsset);
}

function escapeInlineScript(content: string) {
  return content.replace(/<\/script/gi, "<\\/script");
}

async function readSmallTextAsset(storagePath: string, relativePath: string, maxBytes = 750_000) {
  const { absolute } = resolveProjectFile(storagePath, relativePath);
  const buffer = await readFile(absolute);
  if (buffer.byteLength > maxBytes) return null;
  return buffer.toString("utf8");
}

async function inlinePreviewAssets(projectId: string, storagePath: string, entryPath: string, html: string) {
  let rewritten = html;
  rewritten = rewritten.replace(
    /<link\b([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, before: string, value: string, after: string) => {
      const attrs = `${before} ${after}`;
      if (!isPreviewLocalAsset(value) || !/rel=["'][^"']*stylesheet/i.test(attrs)) return match;
      return `<!-- meldex-inline-css:${resolvePreviewAssetPath(entryPath, value)} -->`;
    }
  );
  rewritten = rewritten.replace(
    /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (match, before: string, value: string) => {
      if (!isPreviewLocalAsset(value)) return match;
      return `<!-- meldex-inline-js:${resolvePreviewAssetPath(entryPath, value)} -->`;
    }
  );

  const cssMarkers = [...rewritten.matchAll(/<!-- meldex-inline-css:([^>]+?) -->/g)];
  for (const marker of cssMarkers) {
    const markerText = marker[0];
    const relative = marker[1];
    const css = await readSmallTextAsset(storagePath, relative).catch(() => null);
    rewritten = rewritten.replace(
      markerText,
      css === null
        ? `<link rel="stylesheet" href="${previewAssetUrl(projectId, entryPath, relative)}">`
        : `<style data-meldex-preview="${relative}">\n${rewritePreviewCss(projectId, relative, css)}\n</style>`
    );
  }

  const jsMarkers = [...rewritten.matchAll(/<!-- meldex-inline-js:([^>]+?) -->/g)];
  for (const marker of jsMarkers) {
    const markerText = marker[0];
    const relative = marker[1];
    const js = await readSmallTextAsset(storagePath, relative).catch(() => null);
    rewritten = rewritten.replace(
      markerText,
      js === null
        ? `<script src="${previewAssetUrl(projectId, entryPath, relative)}"></script>`
        : `<script data-meldex-preview="${relative}">\n${escapeInlineScript(js)}\n</script>`
    );
  }

  return rewritten;
}

async function rewritePreviewHtml(projectId: string, storagePath: string, entryPath: string, html: string) {
  const inlined = await inlinePreviewAssets(projectId, storagePath, entryPath, html);
  return inlined
    .replace(/\b(href|src)=["']([^"']+)["']/gi, (match, attr: string, value: string) => {
      if (!isPreviewLocalAsset(value)) return match;
      return `${attr}="${previewAssetUrl(projectId, entryPath, value)}"`;
    })
    .replace(/\bsrcset=["']([^"']+)["']/gi, (match, value: string) => {
      const rewritten = value.split(",").map((part) => {
        const [url, ...descriptor] = part.trim().split(/\s+/);
        if (!url || !isPreviewLocalAsset(url)) return part.trim();
        return [previewAssetUrl(projectId, entryPath, url), ...descriptor].join(" ");
      }).join(", ");
      return `srcset="${rewritten}"`;
    });
}

function rewritePreviewCss(projectId: string, entryPath: string, css: string) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote: string, value: string) => {
    if (!isPreviewLocalAsset(value)) return match;
    const nextQuote = quote || "";
    return `url(${nextQuote}${previewAssetUrl(projectId, entryPath, value)}${nextQuote})`;
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const { searchParams } = new URL(request.url);
    const verifyOnly = searchParams.get("verify") === "1";
    if (verifyOnly) {
      const gate = await canUseFeature(session.user.id, "preview_runtime");
      if (!gate.ok) return NextResponse.json(featureBlockedResponse(gate), { status: 402, headers: { "Cache-Control": "no-store" } });
      const verification = await verifyStaticPreview(session.user.id, id);
      return NextResponse.json(verification, { headers: { "Cache-Control": "no-store" } });
    }

    const filePath = searchParams.get("file") || await findStaticPreviewEntry(project.storagePath) || "index.html";
    const { absolute } = resolveProjectFile(project.storagePath, filePath);
    const fileBuffer = await readFile(absolute);
    let body: BodyInit = new Uint8Array(fileBuffer);
    const type = contentTypes[path.extname(absolute).toLowerCase()] || "text/plain; charset=utf-8";
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    if (type.startsWith("text/html")) {
      body = await rewritePreviewHtml(id, project.storagePath, filePath, fileBuffer.toString("utf8"));
      headers.set("Content-Security-Policy", "default-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob: https:; font-src 'self' data: https:; frame-ancestors 'self'");
      headers.set("X-Frame-Options", "SAMEORIGIN");
    } else if (type.startsWith("text/css")) {
      body = rewritePreviewCss(id, filePath, fileBuffer.toString("utf8"));
    }
    return new NextResponse(body, {
      status: 200,
      headers,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview unavailable" }, { status: 404 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const gate = await canUseFeature(session.user.id, "preview_runtime");
    if (!gate.ok) return NextResponse.json(featureBlockedResponse(gate), { status: 402, headers: { "Cache-Control": "no-store" } });
    const body = actionSchema.parse(await request.json().catch(() => ({})));

    if (body.action === "stop") {
      const preview = await prisma.workspacePreview.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          url: `/api/workspaces/${project.id}/preview`,
          status: "STOPPED",
          verified: false,
          message: "Preview stopped",
          lastCheckedAt: new Date(),
          logs: { action: body.action },
        },
      });
      return NextResponse.json({ preview }, { headers: { "Cache-Control": "no-store" } });
    }

    const verification = await verifyStaticPreview(session.user.id, project.id);
    const preview = await prisma.workspacePreview.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        url: verification.url,
        status: verification.verified ? "VERIFIED" : "FAILED",
        httpStatus: verification.httpStatus,
        verified: verification.verified,
        message: verification.message,
        lastCheckedAt: new Date(),
        logs: { action: body.action, verification },
      },
    });
    await prisma.workspaceProject.update({
      where: { id: project.id },
      data: { lastPreviewUrl: verification.url },
    });
    return NextResponse.json({ preview, verification }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview action failed" }, { status: 400 });
  }
}
