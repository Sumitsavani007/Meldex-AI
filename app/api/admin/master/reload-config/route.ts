/**
 * POST /api/admin/master/reload-config
 * Invalidates the in-memory runtime config cache for hot-reload settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { invalidateConfigCache } from "@/lib/runtime-config";
import { logAuditEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  invalidateConfigCache();

  await logAuditEvent({
    userId: session.user.id,
    action: "CONFIG_CACHE_RELOAD",
    resource: "runtime-config",
    success: true,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({ success: true, message: "Runtime config cache cleared" });
}
