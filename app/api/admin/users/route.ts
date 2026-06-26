import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireOwner } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";

const updateUserSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["USER", "ADMIN", "OWNER"]),
});

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authProvider: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, error } = await requireOwner();
    if (error) return error;

    const parsed = updateUserSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { id, role } = parsed.data;
    if (id === session.user.id && role !== "OWNER") {
      return NextResponse.json({ error: "You cannot remove your own owner role" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authProvider: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "USER_ROLE_UPDATE",
      resource: existing.email,
      success: true,
      metadata: { from: existing.role, to: role },
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error updating user role:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
