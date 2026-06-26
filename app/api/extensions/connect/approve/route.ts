import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { createExtensionApiToken } from "@/lib/extension-auth";

const schema = z.object({ userCode: z.string().min(5).max(16) });

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  const code = body.data.userCode.trim().toUpperCase();

  const record = await prisma.extensionDeviceCode.findUnique({ where: { userCode: code } });
  if (!record) return NextResponse.json({ error: "Code not found" }, { status: 404 });
  if (record.expiresAt < new Date()) return NextResponse.json({ error: "Code expired" }, { status: 410 });
  if (record.status !== "pending") return NextResponse.json({ error: "Code already used" }, { status: 409 });

  const raw = await createExtensionApiToken(session.user.id, `VS Code Google Login ${new Date().toLocaleDateString()}`);
  await prisma.extensionDeviceCode.update({
    where: { id: record.id },
    data: {
      userId: session.user.id,
      tokenPlain: raw,
      status: "approved",
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
