/**
 * GET /api/admin/master/settings  — list all settings (masked)
 * POST /api/admin/master/settings — save/update a setting
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import {
  saveSetting,
  isVaultConfigured,
  maskSecret,
} from "@/lib/secret-vault";
import { invalidateConfigCache, REQUIRES_RESTART } from "@/lib/runtime-config";
import { logAuditEvent } from "@/lib/audit";

const saveSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string(),
  category: z.string().default("general"),
  isSecret: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const settings = await prisma.systemSetting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
    select: {
      id: true,
      key: true,
      valueMasked: true,
      category: true,
      isSecret: true,
      requireRestart: true,
      updatedBy: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    settings,
    vaultConfigured: isVaultConfigured(),
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = saveSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
  }

  const { key, value, category, isSecret } = body.data;

  // Block secret saves if vault not configured
  if (isSecret && !isVaultConfigured()) {
    return NextResponse.json(
      { error: "SETTINGS_ENCRYPTION_KEY is not configured. Cannot save secrets." },
      { status: 503 }
    );
  }

  // Determine restart requirement
  const requireRestart = REQUIRES_RESTART.has(key);

  await saveSetting(key, value, {
    category,
    isSecret,
    requireRestart,
    updatedBy: session.user.email ?? session.user.id,
    ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  // Invalidate hot-reload cache
  invalidateConfigCache(key);

  // Record audit log
  await logAuditEvent({
    userId: session.user.id,
    action: "SETTING_UPDATE",
    resource: key,
    success: true,
    metadata: { category, isSecret, requireRestart, masked: isSecret ? maskSecret(value) : value.slice(0, 20) },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({ success: true, requireRestart });
}
