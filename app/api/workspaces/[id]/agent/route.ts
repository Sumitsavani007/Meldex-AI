import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import {
  askWorkspaceAgent,
  buildWorkspaceContext,
  classifyWorkspaceProviderFailure,
  countDiff,
  createWorkspaceSnapshot,
  getOwnedWorkspaceProject,
  isStaticWebsitePrompt,
  offlineStaticWorkspace,
  providerErrorResponse,
  readProjectFile,
  normalizeWorkspaceFileActions,
  updateWorkspaceMemorySnapshot,
  verifyStaticPreview,
  writeProjectFile,
  deleteProjectFile,
} from "@/lib/ai-workspace";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { WorkspaceAgentResponse } from "@/lib/ai-workspace";
import { calculateCredits, canUseFeature, checkParallelTaskLimit, createUserNotification, featureBlockedResponse, getActiveGenerationModel, precheckUserAiRequest, recordAiCreditUsage, usageFromCompletion } from "@/lib/plans-credits";
import { createNotification } from "@/lib/notifications";
import { checkDynamicRateLimit, detectAbuse } from "@/lib/ai-infrastructure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  prompt: z.string().min(1).max(12000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  let taskId: string | null = null;
  const projectId = id;
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || `workspace-agent:${session.user.id}`, 12);
    const body = schema.parse(await request.json());
    const abuseCheck = await detectAbuse({ userId: session.user.id, prompt: body.prompt, action: "agent_runs" });
    if (!abuseCheck.ok) return NextResponse.json(abuseCheck, { status: 429, headers: { "Cache-Control": "no-store" } });
    const dynamicRateLimit = await checkDynamicRateLimit(session.user.id, "agent_runs");
    if (!dynamicRateLimit.ok) return NextResponse.json(dynamicRateLimit, { status: 429, headers: { "Cache-Control": "no-store" } });
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const agentGate = await canUseFeature(session.user.id, "agent_runs");
    if (!agentGate.ok) return NextResponse.json(featureBlockedResponse(agentGate), { status: 402, headers: { "Cache-Control": "no-store" } });
    const memoryGate = await canUseFeature(session.user.id, "memory");
    const previewGate = await canUseFeature(session.user.id, "preview_runtime");
    const parallelCheck = await checkParallelTaskLimit(session.user.id);
    if (!parallelCheck.ok) return NextResponse.json(parallelCheck, { status: 402, headers: { "Cache-Control": "no-store" } });
    const activeModel = await getActiveGenerationModel();
    const promptTokens = Math.ceil(body.prompt.length / 4);
    const preEstimate = await calculateCredits({ provider: activeModel.provider, model: activeModel.model, inputTokens: promptTokens, toolCalls: 2, memoryReads: memoryGate.ok ? 1 : 0 });
    const creditCheck = await precheckUserAiRequest({
      userId: session.user.id,
      estimatedCredits: preEstimate.credits,
      provider: activeModel.provider,
      model: activeModel.model,
      estimatedContextTokens: promptTokens,
    });
    if (!creditCheck.ok) {
      await createUserNotification({
        userId: session.user.id,
        type: "plan_limit_reached",
        title: "Plan limit reached",
        message: creditCheck.message,
        metadata: { limitType: creditCheck.limitType, recommendedPlan: creditCheck.recommendedPlan },
      }).catch(() => undefined);
      return NextResponse.json({
        error: creditCheck.message,
        code: creditCheck.code,
        limitType: creditCheck.limitType,
        currentUsage: creditCheck.currentUsage,
        limit: creditCheck.limit,
        resetAt: creditCheck.resetAt,
        recommendedPlan: creditCheck.recommendedPlan,
        estimatedCredits: preEstimate.credits,
        details: creditCheck,
      }, { status: 402, headers: { "Cache-Control": "no-store" } });
    }

    const task = await prisma.workspaceTask.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        prompt: body.prompt,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    taskId = task.id;
    const snapshot = await createWorkspaceSnapshot(session.user.id, project.id, task.id);

    await prisma.workspaceLog.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        event: "thinking",
        message: "Thinking",
        metadata: { snapshotId: snapshot.id },
      },
    });

    const context = await buildWorkspaceContext(project.id, project.storagePath, memoryGate.ok ? session.user.id : undefined, body.prompt);
    const contextTokens = Math.ceil([
      body.prompt,
      context.projectFiles.join("\n"),
      context.memoryContext?.snippet || "",
      ...context.relevantFiles.map((file) => file.content),
    ].join("\n").length / 4);
    const contextCheck = await precheckUserAiRequest({
      userId: session.user.id,
      estimatedCredits: preEstimate.credits,
      provider: activeModel.provider,
      model: activeModel.model,
      estimatedContextTokens: contextTokens,
    });
    if (!contextCheck.ok) throw new Error(`${contextCheck.code}: ${contextCheck.message}`);
    await prisma.workspaceLog.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        event: "memory_loaded",
        message: memoryGate.ok ? (context.memoryContext.relatedTaskCount ? "Loaded workspace memory and found related previous task." : "Loaded workspace memory.") : "Workspace memory disabled by plan.",
        metadata: { relatedTaskCount: memoryGate.ok ? context.memoryContext.relatedTaskCount : 0, reusedStyle: memoryGate.ok ? context.memoryContext.reusedStyle : false, avoidedIssue: memoryGate.ok ? context.memoryContext.avoidedIssue : false },
      },
    });
    let response: WorkspaceAgentResponse;
    let providerFailure: ReturnType<typeof classifyWorkspaceProviderFailure> | null = null;
    let offlineMode = false;
    const retries = 0;
    let autofixes = 0;
    try {
      response = await askWorkspaceAgent(body.prompt, context, "", { userId: session.user.id, taskType: "workspace_agent" });
      for (const runtimeEvent of response.runtimeV4?.events || []) {
        await prisma.workspaceLog.create({
          data: {
            userId: session.user.id,
            projectId: project.id,
            taskId: task.id,
            event: runtimeEvent.type,
            message: runtimeEvent.message,
            metadata: runtimeEvent.payload as Prisma.InputJsonValue,
          },
        });
      }
    } catch (providerError) {
      providerFailure = classifyWorkspaceProviderFailure(providerError, body.prompt);
      await prisma.workspaceLog.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          taskId: task.id,
          level: "warn",
          event: "provider_failure",
          message: providerFailure.userMessage,
          metadata: providerFailure,
        },
      });
      if (!providerFailure.offlineAvailable) throw providerError;
      response = offlineStaticWorkspace(body.prompt);
      offlineMode = true;
      await prisma.workspaceLog.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          taskId: task.id,
          event: "offline_mode",
          message: "Offline Workspace Mode created starter files so the workspace remains usable.",
          metadata: { providerFailure },
        },
      });
    }
    const plan = Array.isArray(response.plan) ? response.plan.slice(0, 8) : ["Understand request", "Create files", "Verify preview"];
    let files = normalizeWorkspaceFileActions(Array.isArray(response.files) ? response.files : [], body.prompt);
    if (response.runtimeV4?.reflection) {
      await prisma.workspaceLog.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          taskId: task.id,
          event: (response.runtimeV4.reflection as { ok?: boolean }).ok ? "local_reflection_done" : "local_reflection_failed",
          message: (response.runtimeV4.reflection as { ok?: boolean }).ok ? "Local reflection passed." : "Local reflection requested targeted repair.",
          metadata: response.runtimeV4.reflection as Prisma.InputJsonValue,
        },
      });
    }
    if (!files.length && isStaticWebsitePrompt(body.prompt)) {
      autofixes += 1;
      const fallback = offlineStaticWorkspace(body.prompt);
      response = {
        ...fallback,
        summary: `${response.summary || "The model returned no file actions."} Meldex generated safe static workspace files as an autofix.`,
        warnings: [...(response.warnings || []), "Model returned no file actions; static workspace autofix generated required files."],
      };
      files = normalizeWorkspaceFileActions(fallback.files || [], body.prompt);
      await prisma.workspaceLog.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          taskId: task.id,
          level: "warn",
          event: "file_extraction_autofix",
          message: "Debugger generated required static files after zero file extraction.",
          metadata: { files: files.map((file) => ({ path: file.path, operation: file.operation })) },
        },
      });
    }
    const changedFiles: Array<{ path: string; operation: string; added: number; removed: number; description?: string }> = [];

    for (const file of files) {
      if (!file.path) continue;
      let oldContent = "";
      try {
        oldContent = await readProjectFile(session.user.id, project.id, file.path);
      } catch {}

      if (file.operation === "delete") {
        await deleteProjectFile(session.user.id, project.id, file.path);
      } else {
        await writeProjectFile(session.user.id, project.id, file.path, file.content || "", oldContent ? "EDITED" : "CREATED");
      }

      const diff = countDiff(oldContent, file.operation === "delete" ? "" : file.content || "");
      changedFiles.push({ path: file.path, operation: file.operation, added: diff.added, removed: diff.removed, description: file.description });
      await prisma.workspaceDiff.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          taskId: task.id,
          path: file.path,
          operation: file.operation,
          added: diff.added,
          removed: diff.removed,
          oldContent,
          newContent: file.operation === "delete" ? "" : file.content || "",
        },
      });
      await prisma.workspaceLog.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          taskId: task.id,
          event: "file_changed",
          message: `${file.operation === "create" ? "Created" : file.operation === "delete" ? "Deleted" : "Edited"} ${file.path}`,
          metadata: { path: file.path, operation: file.operation },
        },
      });
    }

    if (!previewGate.ok) return NextResponse.json(featureBlockedResponse(previewGate), { status: 402, headers: { "Cache-Control": "no-store" } });
    const verification = await verifyStaticPreview(session.user.id, project.id);
    const qualityScore = Math.max(0, Math.min(100, 68 + (verification.verified ? 20 : 0) + Math.min(12, changedFiles.length * 2)));
    const preview = await prisma.workspacePreview.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        url: verification.url,
        status: verification.verified ? "VERIFIED" : "FAILED",
        httpStatus: verification.httpStatus,
        verified: verification.verified,
        message: verification.message,
        lastCheckedAt: new Date(),
        logs: { verification },
      },
    });

    await prisma.workspaceRun.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        command: "static-preview-verify",
        status: verification.verified ? "SUCCEEDED" : "FAILED",
        exitCode: verification.verified ? 0 : 1,
        stdout: verification.message,
        previewUrl: verification.url,
      },
    });

    const summary = offlineMode
      ? `${response.summary || "Offline Workspace Mode created starter files."} Provider reason: ${providerFailure?.userMessage || "Provider unavailable."}`
      : response.summary || (changedFiles.length ? "Done — workspace task completed and preview checked." : "No file edits were returned.");
    const updatedTask = await prisma.workspaceTask.update({
      where: { id: task.id },
      data: {
        status: verification.verified ? "SUCCEEDED" : "FAILED",
        planJson: plan,
        summary,
        qualityScore,
        previewUrl: verification.url,
        completedAt: new Date(),
      },
      include: { diffs: true, runs: true, previews: true, logs: true },
    });
    await prisma.workspaceProject.update({
      where: { id: project.id },
      data: { qualityScore, lastPreviewUrl: verification.url },
    });
    await createNotification({
      userId: session.user.id,
      type: verification.verified ? "agent_task_completed" : "agent_task_failed",
      actionUrl: `/workspace/${project.id}/ide`,
      variables: { taskName: project.name },
      metadata: { projectId: project.id, taskId: task.id, status: updatedTask.status, previewVerified: verification.verified },
      dedupeWindowMinutes: 0,
    }).catch(() => undefined);
    const memory = memoryGate.ok ? await updateWorkspaceMemorySnapshot({
      userId: session.user.id,
      projectId: project.id,
      prompt: body.prompt,
      summary,
      plan,
      changedFiles,
      qualityScore,
      verification,
      status: updatedTask.status,
      errors: verification.verified ? [] : [verification.message],
      fixes: verification.verified ? [`Verified preview for ${changedFiles.length} changed file(s).`] : [],
      commands: ["static-preview-verify"],
    }) : null;
    const tokenUsage = usageFromCompletion(response.usage);
    const finalCredit = await calculateCredits({
      provider: response.provider || activeModel.provider,
      model: response.model || activeModel.model,
      ...tokenUsage,
      toolCalls: 6 + changedFiles.length,
      fileReads: context.relevantFiles.length,
      fileWrites: changedFiles.length,
      previewRuns: 1,
      memoryReads: memoryGate.ok ? 1 : 0,
      memoryWrites: memoryGate.ok ? 1 : 0,
      retries,
      autofixes,
    });
    const usage = await recordAiCreditUsage({
      userId: session.user.id,
      credits: finalCredit.credits,
      provider: response.provider || activeModel.provider,
      model: response.model || activeModel.model,
      metadata: {
      projectId: project.id,
      taskId: task.id,
      promptLength: body.prompt.length,
      contextTokens,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      reasoningTokens: tokenUsage.reasoningTokens,
      cachedTokens: tokenUsage.cachedTokens,
      estimated: tokenUsage.estimated,
      filesChanged: changedFiles.length,
      fileReads: context.relevantFiles.length,
      fileWrites: changedFiles.length,
      toolCalls: 6 + changedFiles.length,
      retries,
      autofixes,
      previewRuns: 1,
      previewVerified: verification.verified,
      breakdown: finalCredit.breakdown,
      },
    });

    return NextResponse.json({
      task: updatedTask,
      plan,
      summary,
      changedFiles,
      preview,
      verification,
      qualityScore,
      offlineMode,
      providerFailure,
      memory,
      usage,
      creditsUsed: finalCredit.credits,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (taskId) {
      await prisma.workspaceTask.update({
        where: { id: taskId },
        data: { status: "FAILED", summary: err instanceof Error ? err.message : "Workspace task failed", completedAt: new Date() },
      }).catch(() => undefined);
      await createNotification({
        userId: session.user.id,
        type: "agent_task_failed",
        actionUrl: `/workspace/${projectId}/ide`,
        variables: { taskName: "Workspace task" },
        metadata: { projectId, taskId, error: err instanceof Error ? err.message : "Workspace task failed" },
        dedupeWindowMinutes: 0,
      }).catch(() => undefined);
    }
    const provider = providerErrorResponse(err);
    return NextResponse.json(provider.body, { status: provider.status, headers: { "Cache-Control": "no-store" } });
  }
}
