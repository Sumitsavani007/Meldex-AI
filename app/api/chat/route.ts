import { NextResponse } from "next/server";
import { chatRequestSchema, checkRateLimit } from "@/lib/security";
import { requireAuth } from "@/lib/role-guard";
import {
  generateChatCompletion,
  getActiveProvider,
  getProviderLabel,
  ModelRouterError,
} from "@/lib/model-router";
import { modelErrorStatus, toSafeProviderError } from "@/lib/provider-health";
import { selectBrain } from "@/lib/tool-selector";
import { advancedSearch } from "@/lib/search-brain";
import { generateAnswer } from "@/lib/answer-brain";
import { reason } from "@/lib/reasoning-brain";
import { createPlan, formatPlanMarkdown } from "@/lib/planning-brain";
import { runMultiAgent, runFastAgent, formatMultiAgentResult } from "@/lib/multi-agent";
import {
  buildMemoryContext,
  learnFromMessage,
  answerMemoryQuery,
  memPush,
  MEMORY_KEY,
} from "@/lib/memory-brain";
import { buildProjectContext } from "@/lib/project-brain";
import { lookupFact } from "@/lib/knowledge-brain";
import { resolveConversationContext, buildConversationContext } from "@/lib/conversation-brain";
import { ensureConversation, saveMessage } from "@/lib/chat-persistence";
import { calculateCredits, canUseFeature, createUserNotification, featureBlockedResponse, getActiveGenerationModel, precheckUserAiRequest } from "@/lib/plans-credits";
import { checkDynamicRateLimit, detectAbuse } from "@/lib/ai-infrastructure";

const CHAT_SYSTEM_PROMPT = `You are Meldex AI, a friendly and knowledgeable assistant.
Answer questions clearly and naturally — like ChatGPT, not like a search engine.
Support Gujarati, Hindi and English — always respond in the SAME LANGUAGE the user writes in.
For Gujarati questions, answer in Gujarati (romanized or script).
Be direct: give the answer first, then explain if needed.
Do NOT create files or run commands unless the user explicitly asks.`;

const AGENT_SYSTEM_PROMPT = `You are Meldex AI Coding Agent.
Your job is to create, edit, and fix project files when the user asks for coding or build tasks.
Always show a plan first, then list changed files, and end with a clear summary.
Support Gujarati, Hindi and English — respond in the same language the user writes in.
Only perform file or system operations when explicitly requested.`;

const MATH_SYSTEM_PROMPT = `You are Meldex AI. Solve the mathematical problem accurately.
Show steps if needed. Support Gujarati, Hindi and English.`;

export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    const userId = session.user.id;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-chat", 40);

    const body = chatRequestSchema.parse(await request.json()) as {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      model?: string;
      mode?: "chat" | "agent";
      baseUrl?: string;      conversationId?: string;    };

    if (!body.messages.length) {
      return NextResponse.json({ error: "No chat messages were provided." }, { status: 400 });
    }

    const chatGate = await canUseFeature(userId, "chat");
    if (!chatGate.ok) {
      return NextResponse.json({
        ...featureBlockedResponse(chatGate),
        actions: ["Upgrade to Meldex Plus", "View Usage", "Try again after reset"],
      }, { status: 402, headers: { "Cache-Control": "no-store" } });
    }

    const userMessages = body.messages.filter((m) => m.role !== "system");
    const lastUserMessage =
      userMessages.filter((m) => m.role === "user").at(-1)?.content ?? "";

    const abuseCheck = await detectAbuse({ userId, prompt: lastUserMessage, action: "chat" });
    if (!abuseCheck.ok) {
      return NextResponse.json(abuseCheck, { status: 429, headers: { "Cache-Control": "no-store" } });
    }
    const dynamicRateLimit = await checkDynamicRateLimit(userId, "chat");
    if (!dynamicRateLimit.ok) {
      return NextResponse.json(dynamicRateLimit, { status: 429, headers: { "Cache-Control": "no-store" } });
    }

    // Resolve provider once — uses runtime config (vault > env)
    const provider = await getActiveProvider();
    const providerLabel = await getProviderLabel();
    const activeModel = await getActiveGenerationModel();
    const estimatedTokens = Math.ceil(body.messages.map((message) => message.content).join("\n").length / 4);
    const estimatedCredits = await calculateCredits({
      provider: activeModel.provider,
      model: body.model || activeModel.model,
      inputTokens: estimatedTokens,
      toolCalls: 1,
      memoryReads: 1,
    });
    const planCheck = await precheckUserAiRequest({
      userId,
      estimatedCredits: estimatedCredits.credits,
      provider: activeModel.provider,
      model: body.model || activeModel.model,
      estimatedContextTokens: estimatedTokens,
    });
    if (!planCheck.ok) {
      await createUserNotification({
        userId,
        type: "plan_limit_reached",
        title: "Plan limit reached",
        message: planCheck.message,
        metadata: { limitType: planCheck.limitType, recommendedPlan: planCheck.recommendedPlan },
      }).catch(() => undefined);
      return NextResponse.json({
        error: planCheck.message,
        code: planCheck.code,
        limitType: planCheck.limitType,
        currentUsage: planCheck.currentUsage,
        limit: planCheck.limit,
        resetAt: planCheck.resetAt,
        recommendedPlan: planCheck.recommendedPlan,
        actions: ["Upgrade to Meldex Plus", "View Usage", "Try again after reset"],
      }, { status: 402, headers: { "Cache-Control": "no-store" } });
    }

    // Background: learn from message, track recent topic
    learnFromMessage(userId, lastUserMessage).catch(() => {});
    memPush(userId, MEMORY_KEY.RECENT_TOPICS, lastUserMessage.slice(0, 80), 10).catch(() => {});

    // ── Persist conversation & user message (background, non-blocking) ──────
    const persistConvId: { id?: string } = {};
    ensureConversation(userId, body.conversationId, lastUserMessage, {
      model: body.model,
      provider,
    }).then((convId) => {
      persistConvId.id = convId;
      return saveMessage(convId, "user", lastUserMessage, { model: body.model });
    }).catch(() => {});

    // ── Conversation context resolution ────────────────────────────────────
    // Resolve follow-up pronouns (eni, teni, e, aa, pase ryu…) using history
    const convHistory = userMessages
      .slice(0, -1)
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant"
      );
    const convCtx = resolveConversationContext(lastUserMessage, convHistory);
    const effectiveMessage = convCtx.enrichedMessage;

    // ── Smart brain selection (with conversation context) ──────────────────────
    const mode = body.mode ?? "chat";
    // Pass all messages before the last user message as context
    const historyForContext = userMessages.slice(0, -1);
    const brain = selectBrain(effectiveMessage, mode, historyForContext);
    // ── MEMORY BRAIN ────────────────────────────────────────────────────────
    if (brain.brain === "memory") {
      const answer = await answerMemoryQuery(userId, lastUserMessage);
      return NextResponse.json({
        message: answer,
        brain: brain.brain,
        brainLabel: brain.label,
        provider,
        providerLabel,
      });
    }

    // ── PROJECT BRAIN ───────────────────────────────────────────────────────
    if (brain.brain === "project") {
      const projectCtx = await buildProjectContext(userId);
      return NextResponse.json({
        message: projectCtx,
        brain: brain.brain,
        brainLabel: brain.label,
        provider,
        providerLabel,
      });
    }

    // ── KNOWLEDGE BRAIN ──────────────────────────────────────────────────────
    if (brain.brain === "knowledge") {
      const factResult = lookupFact(lastUserMessage);
      if (factResult.found) {
        return NextResponse.json({
          message: factResult.answer,
          brain: brain.brain,
          brainLabel: brain.label,
          provider,
          providerLabel,
        });
      }
      // Fact not found in KB — fall through to chat brain with context
    }

    // ── SEARCH BRAIN ────────────────────────────────────────────────────────
    if (brain.brain === "search") {
      try {
        const searchResult = await advancedSearch(lastUserMessage);
        const answerResult = await generateAnswer(lastUserMessage, searchResult, body.model);
        return NextResponse.json({
          message: answerResult.answer,
          brain: brain.brain,
          brainLabel: brain.label,
          provider,
          providerLabel,
          sources: answerResult.sources,
          confidence: answerResult.confidence,
          searchQueries: answerResult.searchQueries,
          searchProvider: answerResult.provider,
          checkedAt: answerResult.checkedAt,
          cacheHit: answerResult.cacheHit,
        });
      } catch {
        // Search failed — fall through to chat brain
      }
    }

    // ── MATH / TIME BRAIN ────────────────────────────────────────────────────
    if (brain.brain === "math" || brain.brain === "time") {
      const messages = [
        { role: "system" as const, content: MATH_SYSTEM_PROMPT },
        ...userMessages,
      ];
      const message = await generateChatCompletion({ messages, model: body.model, userId, taskType: "chat_math" });
      return NextResponse.json({
        message,
        brain: brain.brain,
        brainLabel: brain.label,
        provider,
        providerLabel,
      });
    }

    // ── REASONING BRAIN ──────────────────────────────────────────────────────
    if (brain.brain === "reasoner") {
      const memCtx = await buildMemoryContext(userId);
      const result = await reason(lastUserMessage, memCtx || undefined, body.model);
      return NextResponse.json({
        message: result.answer,
        brain: brain.brain,
        brainLabel: brain.label,
        provider,
        providerLabel,
        reasoning: {
          thinking: result.thinking,
          verification: result.verification,
          confidence: result.confidence,
          totalMs: result.totalMs,
        },
      });
    }

    // ── PLANNING BRAIN ───────────────────────────────────────────────────────
    if (brain.brain === "planner") {
      const memCtx = await buildMemoryContext(userId);
      const plan = await createPlan(lastUserMessage, memCtx || undefined, body.model);
      const markdown = formatPlanMarkdown(plan);
      memPush(userId, MEMORY_KEY.RECENT_PROJECTS, plan.projectName, 10).catch(() => {});
      return NextResponse.json({
        message: markdown,
        brain: brain.brain,
        brainLabel: brain.label,
        provider,
        providerLabel,
        plan,
      });
    }

    // ── MULTI-AGENT BRAIN ────────────────────────────────────────────────────
    if (brain.brain === "multi_agent") {
      const result = await runMultiAgent(lastUserMessage, body.model);
      return NextResponse.json({
        message: formatMultiAgentResult(result),
        brain: brain.brain,
        brainLabel: brain.label,
        provider,
        providerLabel,
        agents: result.agents.map((a) => ({ agent: a.agent, durationMs: a.durationMs })),
      });
    }

    // ── AGENT BRAIN (Coding Agent) ────────────────────────────────────────────
    if (brain.brain === "agent" || mode === "agent") {
      const useMulti = lastUserMessage.split(" ").length > 50;
      if (useMulti) {
        const result = await runFastAgent(lastUserMessage, body.model);
        return NextResponse.json({
          message: formatMultiAgentResult(result),
          brain: "agent",
          brainLabel: "AGENT",
          provider,
          providerLabel,
        });
      }
      const memCtx = await buildMemoryContext(userId);
      const sysPrompt = memCtx ? `${AGENT_SYSTEM_PROMPT}\n\n${memCtx}` : AGENT_SYSTEM_PROMPT;
      const messages = [
        { role: "system" as const, content: sysPrompt },
        ...userMessages,
      ];
      const message = await generateChatCompletion({ messages, model: body.model, userId, taskType: "chat_agent" });
      return NextResponse.json({
        message,
        brain: "agent",
        brainLabel: "AGENT",
        provider,
        providerLabel,
      });
    }

    // ── CHAT BRAIN (default) ──────────────────────────────────────────────────
    const memCtx = await buildMemoryContext(userId);
    const convHistoryCtx = buildConversationContext(convHistory);

    const sysPromptParts = [CHAT_SYSTEM_PROMPT];
    if (memCtx) sysPromptParts.push(memCtx);
    if (convHistoryCtx && convCtx.contextInjected) sysPromptParts.push(convHistoryCtx);

    const messages = [
      { role: "system" as const, content: sysPromptParts.join("\n\n") },
      ...userMessages,
    ];
    const message = await generateChatCompletion({ messages, model: body.model, userId, taskType: "chat" });

    // Persist assistant reply
    if (persistConvId.id) {
      saveMessage(persistConvId.id, "assistant", message, {
        model: body.model,
        brain: "chat",
      }).catch(() => {});
    }

    return NextResponse.json({
      message,
      brain: "chat",
      brainLabel: "CHAT",
      provider,
      providerLabel,
      conversationId: persistConvId.id,
    });
  } catch (err) {
    if (err instanceof ModelRouterError) {
      const safe = toSafeProviderError(err);
      return NextResponse.json(
        { error: safe.userMessage, code: safe.code, providerError: safe },
        { status: modelErrorStatus(safe.code, safe.statusCode), headers: { "Cache-Control": "no-store" } }
      );
    }
    const message = err instanceof Error ? err.message : "Chat request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
