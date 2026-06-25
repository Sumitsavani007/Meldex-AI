/**
 * POST /api/extensions/auth
 * Extension login: { email, password } → { token, user }
 * Returns a 30-day JWT for use in subsequent extension API calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateExtension } from "@/lib/extension-auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { token, user } = await authenticateExtension(body.data.email, body.data.password);

    return NextResponse.json({ token, user }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
