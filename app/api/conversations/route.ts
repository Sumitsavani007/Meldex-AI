/**
 * GET  /api/conversations  — list user's conversations (paginated)
 * POST /api/conversations  — create a new conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  activeBrain: z.string().optional(),
  projectId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20)));
  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        provider: true,
        model: true,
        activeBrain: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where: { userId: session.user.id } }),
  ]);

  return NextResponse.json({ conversations, total, page, limit });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = createSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      title: body.data.title ?? "New Conversation",
      provider: body.data.provider,
      model: body.data.model,
      activeBrain: body.data.activeBrain,
      projectId: body.data.projectId,
    },
  });

  return NextResponse.json(conversation, { status: 201 });
}
