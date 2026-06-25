/**
 * GET    /api/conversations/[id]  — get conversation with messages
 * PATCH  /api/conversations/[id]  — rename conversation
 * DELETE /api/conversations/[id]  — delete conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().optional(),
  activeBrain: z.string().optional(),
});

async function getOwnConversation(id: string, userId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id, userId },
  });
  return conv;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const skip = (page - 1) * limit;

  const conv = await getOwnConversation(id, session.user.id);
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [messages, totalMessages] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        model: true,
        brain: true,
        sourcesJson: true,
        metadataJson: true,
        tokenCount: true,
        createdAt: true,
      },
    }),
    prisma.message.count({ where: { conversationId: id } }),
  ]);

  return NextResponse.json({ ...conv, messages, totalMessages, page, limit });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const conv = await getOwnConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const updated = await prisma.conversation.update({
    where: { id },
    data: {
      ...(body.data.title && { title: body.data.title }),
      ...(body.data.model && { model: body.data.model }),
      ...(body.data.activeBrain && { activeBrain: body.data.activeBrain }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const conv = await getOwnConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
