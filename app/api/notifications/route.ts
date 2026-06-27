import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getNotificationPreference, NOTIFICATION_TYPES } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["mark_read", "mark_all_read"]),
  ids: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);
  return NextResponse.json({ notifications, unreadCount }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = patchSchema.parse(await request.json().catch(() => ({})));
  if (body.action === "mark_all_read") {
    await prisma.notification.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const ids = body.ids || [];
  await prisma.notification.updateMany({ where: { userId: session.user.id, id: { in: ids } }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const preferences = await Promise.all(NOTIFICATION_TYPES.map((type) => getNotificationPreference(session.user.id, type)));
  return NextResponse.json({ preferences }, { headers: { "Cache-Control": "no-store" } });
}
