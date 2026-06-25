/**
 * POST /api/extensions/tokens/create
 * Creates a new API token for the authenticated web-session user.
 * Returns the raw token ONCE — it is never stored in DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { createExtensionApiToken, prisma } from "@/lib/extension-auth";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1).max(80).optional() });

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = schema.safeParse(await req.json().catch(() => ({})));
    const name = body.success ? body.data.name : undefined;

    const raw = await createExtensionApiToken(session.user.id, name);

    return NextResponse.json({ token: raw, message: "Copy this token now — it will not be shown again." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create token" },
      { status: 500 }
    );
  }
}
