import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/stats
 * Returns aggregate counts for the admin dashboard.
 * Falls back to zeros if the DB is unavailable.
 */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const [users, projects, tasks, executions, auditLogs] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.execution.count(),
      prisma.auditLog.count(),
    ]);

    return NextResponse.json({ users, projects, tasks, executions, auditLogs });
  } catch (err) {
    console.error("Admin stats error:", err);
    // Return zeros as a safe fallback so the UI never crashes
    return NextResponse.json(
      { users: 0, projects: 0, tasks: 0, executions: 0, auditLogs: 0 },
      { status: 200 }
    );
  }
}
