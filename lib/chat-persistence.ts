/**
 * lib/chat-persistence.ts
 * Helpers for persisting chat conversations and messages to the database.
 */

import { prisma } from "@/lib/prisma";

/** Generate a short title from the first user message */
export function generateTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? clean.slice(0, 57) + "..." : clean || "New Conversation";
}

/** Ensure a conversation exists; create one if conversationId is not provided */
export async function ensureConversation(
  userId: string,
  conversationId: string | undefined,
  firstUserMessage: string,
  options: { model?: string; provider?: string; brain?: string } = {}
): Promise<string> {
  if (conversationId) {
    // Verify ownership
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (conv) return conv.id;
  }

  // Create new conversation
  const conv = await prisma.conversation.create({
    data: {
      userId,
      title: generateTitle(firstUserMessage),
      model: options.model,
      provider: options.provider,
      activeBrain: options.brain,
    },
  });
  return conv.id;
}

/** Save a message to a conversation */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  options: {
    model?: string;
    brain?: string;
    sourcesJson?: unknown;
    metadataJson?: unknown;
    tokenCount?: number;
  } = {}
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      model: options.model,
      brain: options.brain,
      sourcesJson: options.sourcesJson ?? undefined,
      metadataJson: options.metadataJson ?? undefined,
      tokenCount: options.tokenCount ?? 0,
    },
  });

  // Touch updatedAt on conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}
