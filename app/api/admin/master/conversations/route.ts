/**
 * GET /api/admin/master/conversations
 * Returns all conversations (admin view) with message counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));

  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true, title: true, model: true, activeBrain: true,
      updatedAt: true, createdAt: true,
      user: { select: { email: true } },
      _count: { select: { messages: true } },
    },
  });

  const total = await prisma.conversation.count();

  return NextResponse.json({ conversations, total }, {
    headers: { "Cache-Control": "no-store" },
  });
}
