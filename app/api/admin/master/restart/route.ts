/**
 * POST /api/admin/master/restart
 * Safely restarts the PM2 process using --update-env.
 * Only ADMIN/OWNER.
 */

import { NextRequest } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireOwner } from "@/lib/role-guard";
import { logAuditEvent } from "@/lib/audit";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { session, error } = await requireOwner();
  if (error) return error;

  await logAuditEvent({
    userId: session.user.id,
    action: "APP_RESTART",
    resource: "pm2:meldex-ai",
    success: true,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  // Fire restart in background so we can return a response first
  setImmediate(async () => {
    try {
      await execAsync("pm2 restart meldex-ai --update-env");
    } catch {
      // If PM2 not available, try graceful process exit (will restart via systemd/PM2 autorestart)
      setTimeout(() => process.exit(0), 500);
    }
  });

  return Response.json({
    success: true,
    message: "Restart initiated. App will be back in ~5 seconds.",
  });
}
