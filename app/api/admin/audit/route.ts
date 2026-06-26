import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const [auditLogs, settingAudits] = await Promise.all([
      prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        resource: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { email: true } },
      },
      }),
      prisma.systemSettingAudit.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          key: true,
          action: true,
          oldMasked: true,
          newMasked: true,
          updatedBy: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    const logs = [
      ...auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
        userId: log.user?.email ?? null,
        metadata: null,
      })),
      ...settingAudits.map((log) => ({
        id: log.id,
        action: `SETTING_${log.action}`,
        resource: log.key,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
        userId: log.updatedBy ?? null,
        metadata: { oldMasked: log.oldMasked, newMasked: log.newMasked },
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100);

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("Admin audit error:", err);
    return NextResponse.json({ logs: [] }, { status: 200 });
  }
}
