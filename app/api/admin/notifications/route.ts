import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { createNotification, seedNotificationTemplates, sendEmailNotification } from "@/lib/notifications";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_template"),
    id: z.string().min(1),
    subject: z.string().max(200).optional().nullable(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
    isEnabled: z.boolean(),
  }),
  z.object({
    action: z.literal("send_test"),
    type: z.string().min(1),
    userId: z.string().optional(),
  }),
  z.object({
    action: z.literal("resend_email"),
    logId: z.string().min(1),
  }),
]);

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  await seedNotificationTemplates();
  const [templates, logs, notifications] = await Promise.all([
    prisma.notificationTemplate.findMany({ orderBy: [{ type: "asc" }, { channel: "asc" }] }),
    prisma.emailDeliveryLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true, name: true } } } }),
  ]);
  return NextResponse.json({ templates, logs, notifications }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  try {
    await seedNotificationTemplates();
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.action === "update_template") {
      const template = await prisma.notificationTemplate.update({
        where: { id: body.id },
        data: { subject: body.subject || null, title: body.title, body: body.body, isEnabled: body.isEnabled },
      });
      await logAuditEvent({ userId: session.user.id, action: "NOTIFICATION_TEMPLATE_UPDATE", resource: `${template.type}:${template.channel}`, success: true, metadata: { templateId: template.id } });
      return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "send_test") {
      const user = body.userId
        ? await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } })
        : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!user) return NextResponse.json({ error: "No user available for test notification" }, { status: 404 });
      const result = await createNotification({
        userId: user.id,
        type: body.type,
        title: "Test notification",
        message: "This is a Meldex notification template test.",
        metadata: { sentByAdmin: session.user.id },
        dedupeWindowMinutes: 0,
      });
      await logAuditEvent({ userId: session.user.id, action: "NOTIFICATION_TEST_SEND", resource: body.type, success: true, metadata: { targetUserId: user.id } });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const log = await prisma.emailDeliveryLog.findUnique({ where: { id: body.logId } });
    if (!log) return NextResponse.json({ error: "Email log not found" }, { status: 404 });
    const template = log.templateId ? await prisma.notificationTemplate.findUnique({ where: { id: log.templateId } }) : null;
    const resent = await sendEmailNotification({
      userId: log.userId || "",
      type: log.type,
      toEmail: log.toEmail,
      subject: log.subject || template?.subject || template?.title || "Meldex notification",
      body: template?.body || "",
      templateId: template?.id,
      metadata: { resentFrom: log.id },
    });
    return NextResponse.json({ log: resent }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Notification action failed" }, { status: 400 });
  }
}
