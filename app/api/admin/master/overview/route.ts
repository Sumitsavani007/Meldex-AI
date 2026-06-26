/**
 * GET /api/admin/master/overview
 * Enhanced system diagnostics and overview for the enterprise admin panel.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { isVaultConfigured } from "@/lib/secret-vault";
import { getProviderConfig, getRuntimeSetting } from "@/lib/runtime-config";
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

  const [openrouterCfg, r2Cfg, googleCfg, githubCfg] = await Promise.all([
    getProviderConfig("openrouter") as Promise<{ apiKey?: string }>,
    getProviderConfig("r2") as Promise<{ accountId?: string; accessKeyId?: string; secretAccessKey?: string; bucket?: string }>,
    getProviderConfig("google") as Promise<{ clientId?: string; clientSecret?: string }>,
    getProviderConfig("github") as Promise<{ clientId?: string; clientSecret?: string }>,
  ]);

  const checks = {
    database: { status: dbStatus, latencyMs: dbLatencyMs },
    auth: { status: (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) ? "ok" : "misconfigured" },
    r2: { status: (r2Cfg.accountId && r2Cfg.accessKeyId && r2Cfg.secretAccessKey && r2Cfg.bucket) ? "configured" : "not_configured" },
    openrouter: { status: openrouterCfg.apiKey ? "configured" : "not_configured" },
    googleOauth: { status: (googleCfg.clientId && googleCfg.clientSecret) ? "configured" : "not_configured" },
    githubOauth: { status: (githubCfg.clientId && githubCfg.clientSecret) ? "configured" : "not_configured" },
    vault: { status: vaultOk ? "ok" : "not_configured" },
  };

  return NextResponse.json({
    appUrl: await getRuntimeSetting("APP_PUBLIC_URL", process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000"),
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
      instanceId: await getRuntimeSetting("AWS_INSTANCE_ID"),
      region: await getRuntimeSetting("AWS_REGION"),
      publicIp: await getRuntimeSetting("AWS_PUBLIC_IP"),
      deployPath: process.env.AWS_DEPLOY_PATH,
      sshUser: process.env.AWS_SSH_USER,
      serverName: process.env.AWS_SERVER_NAME,
    },
    diagnosticsMs: Date.now() - start,
  }, { headers: { "Cache-Control": "no-store" } });
}
