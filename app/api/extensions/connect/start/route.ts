import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security";

function userCode() {
  return randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})/, "$1-");
}

export async function POST() {
  try {
    checkRateLimit("extension-connect-start", 60, 60_000);
    const deviceCode = randomBytes(32).toString("hex");
    let code = userCode();
    for (let i = 0; i < 4; i += 1) {
      const existing = await prisma.extensionDeviceCode.findUnique({ where: { userCode: code } });
      if (!existing) break;
      code = userCode();
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.extensionDeviceCode.create({
      data: { deviceCode, userCode: code, expiresAt },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://meldex.newsyfly.com";
    return NextResponse.json({
      deviceCode,
      userCode: code,
      verificationUri: `${baseUrl.replace(/\/$/, "")}/connect/device?code=${encodeURIComponent(code)}`,
      expiresAt: expiresAt.toISOString(),
      interval: 2,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start connect flow" }, { status: 429 });
  }
}
