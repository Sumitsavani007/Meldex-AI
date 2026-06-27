import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_TYPES } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const securityTypes = new Set(["new_login", "token_created", "token_revoked", "suspicious_usage", "security_change"]);

const schema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const preferences = await prisma.notificationPreference.findMany({ where: { userId: session.user.id }, orderBy: { type: "asc" } });
  return NextResponse.json({ preferences, types: NOTIFICATION_TYPES }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = schema.parse(await request.json().catch(() => ({})));
  const security = securityTypes.has(body.type);
  const preference = await prisma.notificationPreference.upsert({
    where: { userId_type: { userId: session.user.id, type: body.type } },
    update: {
      ...(body.inAppEnabled !== undefined ? { inAppEnabled: security ? true : body.inAppEnabled } : {}),
      ...(body.emailEnabled !== undefined ? { emailEnabled: security ? true : body.emailEnabled } : {}),
    },
    create: {
      userId: session.user.id,
      type: body.type,
      inAppEnabled: security ? true : body.inAppEnabled ?? true,
      emailEnabled: security ? true : body.emailEnabled ?? true,
    },
  });
  return NextResponse.json({ preference, securityLocked: security }, { headers: { "Cache-Control": "no-store" } });
}
