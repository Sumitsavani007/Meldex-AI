import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { memGetAll, memSet, memDelete } from "@/lib/memory-brain";
import { z } from "zod";

// GET /api/memory — get all memory for current user
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const memory = await memGetAll(session.user.id);
  return NextResponse.json({ memory });
}

// POST /api/memory — set a key/value
const setSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(5000),
});

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = setSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await memSet(session.user.id, body.data.key, body.data.value);
  return NextResponse.json({ ok: true });
}

// DELETE /api/memory?key=xxx — delete a key
export async function DELETE(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  await memDelete(session.user.id, key);
  return NextResponse.json({ ok: true });
}
