import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    const deviceCode = req.nextUrl.searchParams.get("deviceCode") || "";
    if (!deviceCode) return NextResponse.json({ error: "Missing device code" }, { status: 400 });
    checkRateLimit(`extension-connect-poll:${deviceCode}`, 60, 60_000);

    const record = await prisma.extensionDeviceCode.findUnique({ where: { deviceCode } });
    if (!record) return NextResponse.json({ status: "not_found" }, { status: 404 });
    if (record.expiresAt < new Date()) return NextResponse.json({ status: "expired" }, { status: 410 });
    if (record.status !== "approved" || !record.tokenPlain) return NextResponse.json({ status: "pending" }, { headers: { "Cache-Control": "no-store" } });
    if (record.consumedAt) return NextResponse.json({ status: "consumed" }, { status: 409 });

    const token = record.tokenPlain;
    await prisma.extensionDeviceCode.update({
      where: { id: record.id },
      data: { tokenPlain: null, status: "consumed", consumedAt: new Date() },
    });

    return NextResponse.json({ status: "approved", token }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Polling failed" }, { status: 429 });
  }
}
