/**
 * GET /api/admin/master/overview
 * Enhanced system diagnostics and overview for the enterprise admin panel.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { isVaultConfigured, getSetting } from "@/lib/secret-vault";
import os from "os";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const start = Date.now();

  // DB check
  let dbStatus = "ok"; let dbLatencyMs = 0;
  try { const t = Date.now(); await prisma.$queryRaw`SELECT 1`; dbLatencyMs = Date.now() - t; }
  catch { dbStatus = "error"; }

  // System info
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.round((usedMem / totalMem) * 100);
  const cpuLoad = os.loadavg();
  const uptime = os.uptime();

  // DB counts
  const [userCount, projectCount, convCount, msgCount, settingCount] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.project.count().catch(() => 0),
    prisma.conversation.count().catch(() => 0),
    prisma.message.count().catch(() => 0),
    prisma.systemSetting.count().catch(() => 0),
  ]);

  const vaultOk = isVaultConfigured();

  // Check OAuth credentials — env first, then vault
  const googleId = process.env.GOOGLE_CLIENT_ID
    || (vaultOk ? await getSetting("GOOGLE_CLIENT_ID").catch(() => null) : null);
  const githubId = process.env.GITHUB_ID
    || (vaultOk ? await getSetting("GITHUB_ID").catch(() => null) : null);

  const checks = {
    database: { status: dbStatus, latencyMs: dbLatencyMs },
    auth: { status: (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) ? "ok" : "misconfigured" },
    r2: { status: (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) ? "configured" : "not_configured" },
    openrouter: { status: process.env.OPENROUTER_API_KEY ? "configured" : "not_configured" },
    googleOauth: { status: googleId ? (process.env.GOOGLE_CLIENT_ID ? "configured" : "configured_needs_restart") : "not_configured" },
    githubOauth: { status: githubId ? (process.env.GITHUB_ID ? "configured" : "configured_needs_restart") : "not_configured" },
    vault: { status: vaultOk ? "ok" : "not_configured" },
  };

  return NextResponse.json({
    appUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000",
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    buildVersion: process.env.npm_package_version ?? "0.1.0",
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    vaultConfigured: vaultOk,
    checks,
    system: {
      totalMemMb: Math.round(totalMem / 1024 / 1024),
      usedMemMb: Math.round(usedMem / 1024 / 1024),
      freeMemMb: Math.round(freeMem / 1024 / 1024),
      memPercent,
      cpuLoad1: cpuLoad[0].toFixed(2),
      cpuLoad5: cpuLoad[1].toFixed(2),
      cpus: os.cpus().length,
      uptimeSeconds: Math.round(uptime),
    },
    stats: { users: userCount, projects: projectCount, conversations: convCount, messages: msgCount, vaultKeys: settingCount },
    awsMeta: {
      instanceId: process.env.AWS_INSTANCE_ID,
      region: process.env.AWS_REGION,
      publicIp: process.env.AWS_PUBLIC_IP,
      deployPath: process.env.AWS_DEPLOY_PATH,
      sshUser: process.env.AWS_SSH_USER,
      serverName: process.env.AWS_SERVER_NAME,
    },
    diagnosticsMs: Date.now() - start,
  }, { headers: { "Cache-Control": "no-store" } });
}
