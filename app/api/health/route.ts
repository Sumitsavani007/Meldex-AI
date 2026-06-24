/**
 * GET /api/health
 *
 * Returns the operational status of each subsystem.  Used by:
 *   - Docker / Kubernetes readiness / liveness probes
 *   - Uptime monitors
 *   - The admin system-diagnostics page
 *
 * Response shape:
 *   {
 *     status: "ok" | "degraded" | "error",
 *     timestamp: string,
 *     version: string,
 *     checks: {
 *       database: { status, latencyMs? }
 *       auth:     { status }
 *       ollama:   { status, latencyMs?, model? }
 *       workspace:{ status }
 *     }
 *   }
 *
 * HTTP status codes:
 *   200  — all checks pass  (status "ok")
 *   207  — some checks fail (status "degraded")
 *   503  — DB unavailable   (status "error")
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "error";

interface Check {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

async function checkDatabase(): Promise<Check> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : "DB unreachable",
    };
  }
}

async function checkAuth(): Promise<Check> {
  // Auth is stateless JWT — it works as long as NEXTAUTH_SECRET is set
  // and the DB is reachable (for adapter queries).
  if (!process.env.NEXTAUTH_SECRET) {
    return { status: "error", detail: "NEXTAUTH_SECRET not set" };
  }
  return { status: "ok" };
}

async function checkOllama(): Promise<Check> {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { status: "degraded", detail: `HTTP ${res.status}` };
    }
    const data = await res.json() as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    return {
      status: "ok",
      latencyMs: Date.now() - t0,
      detail: models.length > 0 ? `${models.length} model(s) loaded` : "No models loaded",
    };
  } catch (e) {
    return {
      status: "degraded",
      detail: "Ollama unreachable — AI features unavailable",
    };
  }
}

async function checkWorkspace(): Promise<Check> {
  try {
    await ensureWorkspace();
    return { status: "ok" };
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : "Workspace init failed",
    };
  }
}

export async function GET() {
  const [database, auth, ollama, workspace] = await Promise.all([
    checkDatabase(),
    checkAuth(),
    checkOllama(),
    checkWorkspace(),
  ]);

  const checks = { database, auth, ollama, workspace };

  const statuses = Object.values(checks).map((c) => c.status);
  const overallStatus: CheckStatus =
    statuses.includes("error") ? "error" :
    statuses.includes("degraded") ? "degraded" :
    "ok";

  const httpStatus = overallStatus === "error" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      checks,
    },
    { status: httpStatus }
  );
}
