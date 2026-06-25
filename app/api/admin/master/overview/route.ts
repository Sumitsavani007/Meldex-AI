/**
 * GET /api/admin/master/overview
 * Returns system diagnostics for the master admin panel.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { isVaultConfigured } from "@/lib/secret-vault";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const start = Date.now();

  // DB check
  let dbStatus = "ok";
  let dbLatencyMs = 0;
  try {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t;
  } catch {
    dbStatus = "error";
  }

  // Auth status
  const authStatus = !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET ? "ok" : "misconfigured";

  // R2 status
  const r2Status = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID ? "configured" : "not_configured";

  // OpenRouter status
  const openrouterStatus = process.env.OPENROUTER_API_KEY ? "configured" : "not_configured";

  // Counts from DB
  const [userCount, projectCount, convCount, msgCount] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.project.count().catch(() => 0),
    prisma.conversation.count().catch(() => 0),
    prisma.message.count().catch(() => 0),
  ]);

  return NextResponse.json({
    appUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000",
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    buildVersion: process.env.npm_package_version ?? "0.1.0",
    vaultConfigured: isVaultConfigured(),
    checks: {
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      auth: { status: authStatus },
      r2: { status: r2Status },
      openrouter: { status: openrouterStatus },
      googleOauth: { status: process.env.GOOGLE_CLIENT_ID ? "configured" : "not_configured" },
      githubOauth: { status: process.env.GITHUB_ID ? "configured" : "not_configured" },
    },
    stats: { users: userCount, projects: projectCount, conversations: convCount, messages: msgCount },
    awsMeta: {
      instanceId: process.env.AWS_INSTANCE_ID,
      region: process.env.AWS_REGION,
      publicIp: process.env.AWS_PUBLIC_IP,
      deployPath: process.env.AWS_DEPLOY_PATH,
      serverName: process.env.AWS_SERVER_NAME,
    },
    diagnosticsMs: Date.now() - start,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
