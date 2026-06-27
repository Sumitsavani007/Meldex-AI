import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { calculateCredits, canUseFeature, checkParallelTaskLimit, createUserNotification, featureBlockedResponse, getActiveGenerationModel, precheckUserAiRequest, recordAiCreditUsage, usageFromCompletion } from "@/lib/plans-credits";
import { createNotification } from "@/lib/notifications";
import {
  askWorkspaceAgent,
  buildWorkspaceContext,
  classifyWorkspaceProviderFailure,
  countDiff,
  createWorkspaceSnapshot,
  createWorkspaceTaskEvent,
  deleteProjectFile,
  getOwnedWorkspaceProject,
  isStaticWebsitePrompt,
  normalizeWorkspaceFileActions,
  offlineStaticWorkspace,
  readProjectFile,
  updateWorkspaceMemorySnapshot,
  verifyStaticPreview,
  writeProjectFile,
  type WorkspaceAgentResponse,
  type WorkspaceStreamEvent,
} from "@/lib/ai-workspace";
import {
  performanceReviewWorkspaceFiles,
  recordWorkspaceLearning,
  reviewWorkspaceFiles,
  runWorkspaceOrchestration,
  securityReviewWorkspaceFiles,
} from "@/lib/workspace-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  prompt: z.string().min(1).max(12000),
  queued: z.boolean().optional(),
  fork: z.boolean().optional(),
});

function encode(event: WorkspaceStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || `workspace-stream:${session.user.id}`, 20);
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const agentGate = await canUseFeature(session.user.id, "agent_runs");
    if (!agentGate.ok) return NextResponse.json(featureBlockedResponse(agentGate), { status: 402, headers: { "Cache-Control": "no-store" } });
    const memoryGate = await canUseFeature(session.user.id, "memory");
    const previewGate = await canUseFeature(session.user.id, "preview_runtime");
    const parallelCheck = await checkParallelTaskLimit(session.user.id);
    if (!parallelCheck.ok) return NextResponse.json(parallelCheck, { status: 402, headers: { "Cache-Control": "no-store" } });
    const activeModel = await getActiveGenerationModel();
    const promptTokens = Math.ceil(body.data.prompt.length / 4);
    const preEstimate = await calculateCredits({
      provider: activeModel.provider,
      model: activeModel.model,
      inputTokens: promptTokens,
      toolCalls: 2,
      memoryReads: memoryGate.ok ? 1 : 0,
    });
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
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let sequence = 0;
        let taskId: string | null = null;
        let completed = false;
        const send = async (type: string, message: string, payload?: Record<string, unknown>) => {
          if (request.signal.aborted) throw new Error("Task cancelled");
          sequence += 1;
          if (!taskId) {
            const event = { sequence, type, message, payload };
            controller.enqueue(encoder.encode(encode(event)));
            return event;
          }
          const event = await createWorkspaceTaskEvent({ userId: session.user.id, projectId: project.id, taskId, sequence, type, message, payload });
          controller.enqueue(encoder.encode(encode(event)));
          return event;
        };

        try {
          const task = await prisma.workspaceTask.create({
            data: {
              userId: session.user.id,
              projectId: project.id,
              prompt: body.data.prompt,
              status: body.data.queued ? "QUEUED" : "RUNNING",
              startedAt: new Date(),
            },
          });
          taskId = task.id;

          const snapshot = await createWorkspaceSnapshot(session.user.id, project.id, task.id);
          await send("thinking", "Thinking", { taskId, snapshotId: snapshot.id });
          await send("usage_checked", "Plan and credit limits checked", {
            estimatedCredits: preEstimate.credits,
            plan: creditCheck.summary.plan.name,
            model: activeModel.model,
          });
          await prisma.workspaceTask.update({ where: { id: task.id }, data: { status: "RUNNING" } });
          await send("tool_start", "Reading workspace");
          const context = await buildWorkspaceContext(project.id, project.storagePath, memoryGate.ok ? session.user.id : undefined, body.data.prompt);
          const contextTokens = Math.ceil([
            body.data.prompt,
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
          await send("tool_result", "Read workspace", { files: context.projectFiles.length });
          await send("memory_loaded", memoryGate.ok ? (context.memoryContext.relatedTaskCount ? "Loaded workspace memory and found related previous task" : "Loaded workspace memory") : "Workspace memory disabled by plan", {
            relatedTaskCount: memoryGate.ok ? context.memoryContext.relatedTaskCount : 0,
            reusedStyle: memoryGate.ok ? context.memoryContext.reusedStyle : false,
            avoidedIssue: memoryGate.ok ? context.memoryContext.avoidedIssue : false,
          });
          if (memoryGate.ok && context.memoryContext.reusedStyle) await send("memory_reused_style", "Reused project style from memory");
          if (memoryGate.ok && context.memoryContext.avoidedIssue) await send("memory_avoided_issue", "Avoided previous known issue");
          const orchestration = await runWorkspaceOrchestration({
            workspaceId: project.id,
            taskId: task.id,
            userId: session.user.id,
            prompt: body.data.prompt,
            workspaceContext: context,
            currentFiles: context.projectFiles,
            provider: "openrouter",
          });
          for (const event of orchestration.events) await send(event.type, event.message, event.payload);
          if (orchestration.confidence.decision === "ask_user" || orchestration.confidence.decision === "block") {
            throw new Error(orchestration.confidence.reason);
          }
          await send("thinking", "Planning files");

          let response: WorkspaceAgentResponse;
          let offlineMode = false;
          let providerFailure: ReturnType<typeof classifyWorkspaceProviderFailure> | null = null;
          let retries = 0;
          let autofixes = 0;
          try {
            await send("qwen_generation_started", "Qwen generation started", {
              classification: orchestration.classification,
              confidence: orchestration.confidence.score,
            });
            response = await askWorkspaceAgent(body.data.prompt, context, orchestration.finalInstruction);
          } catch (providerError) {
            providerFailure = classifyWorkspaceProviderFailure(providerError, body.data.prompt);
            await send("error", providerFailure.userMessage, { providerFailure });
            if (!providerFailure.offlineAvailable) throw providerError;
            await send("tool_result", "Offline Workspace Mode selected", { reason: providerFailure.kind });
            response = offlineStaticWorkspace(body.data.prompt);
            offlineMode = true;
          }

          const plan = Array.isArray(response.plan) ? response.plan.slice(0, 8) : ["Understand request", "Create files", "Verify preview"];
          await send("plan", `Planned ${plan.length} step${plan.length === 1 ? "" : "s"}`, { plan, offlineMode });
          await send("changes_planned", "Planned changes");

          let files = normalizeWorkspaceFileActions(Array.isArray(response.files) ? response.files : [], body.data.prompt);
          await send("file_extracted", `Extracted ${files.length} file action${files.length === 1 ? "" : "s"}`, {
            files: files.map((file) => ({ path: file.path, operation: file.operation })),
          });
          if (!files.length && isStaticWebsitePrompt(body.data.prompt)) {
            autofixes += 1;
            const fallback = offlineStaticWorkspace(body.data.prompt);
            response = {
              ...fallback,
              summary: `${response.summary || "The model returned no file actions."} Meldex generated safe static workspace files as an autofix.`,
              warnings: [...(response.warnings || []), "Model returned no file actions; static workspace autofix generated required files."],
            };
            files = normalizeWorkspaceFileActions(fallback.files || [], body.data.prompt);
            await send("debugger_fix_applied", "Debugger generated required static files after zero file extraction", {
              fixed: files.length > 0,
              files: files.map((file) => ({ path: file.path, operation: file.operation })),
            });
          }
          let reviewer = reviewWorkspaceFiles(files, orchestration.classification);
          if (reviewer.status === "block") {
            retries += 1;
            await send("reviewer_needs_fix", reviewer.summary, { reviewer });
            const fixPrompt = `${body.data.prompt}\n\nTARGETED FIX REQUIRED:\n${reviewer.findings.join("\n")}\nReturn complete corrected index.html, style.css, script.js, and README.md only.`;
            const fixResponse = await askWorkspaceAgent(fixPrompt, context, orchestration.finalInstruction);
            files = normalizeWorkspaceFileActions(Array.isArray(fixResponse.files) ? fixResponse.files : [], body.data.prompt);
            if (!files.length && isStaticWebsitePrompt(body.data.prompt)) {
              autofixes += 1;
              const fallback = offlineStaticWorkspace(body.data.prompt);
              response = {
                ...fallback,
                summary: `${fixResponse.summary || response.summary || "Targeted regeneration returned no file actions."} Meldex generated safe static workspace files as an autofix.`,
                warnings: [...(fixResponse.warnings || response.warnings || []), "Targeted regeneration returned no file actions; static workspace autofix generated required files."],
              };
              files = normalizeWorkspaceFileActions(fallback.files || [], body.data.prompt);
            }
            reviewer = reviewWorkspaceFiles(files, orchestration.classification);
            await send("debugger_fix_applied", "Debugger regenerated a targeted file fix", {
              fixed: reviewer.status !== "block",
              findings: reviewer.findings,
            });
          }
          await send("reviewer_done", reviewer.summary, { reviewer });
          if (reviewer.status === "block") throw new Error(`Reviewer blocked generated files: ${reviewer.findings.join("; ")}`);
          const security = securityReviewWorkspaceFiles(files);
          await send("security_reviewed", security.summary, { security });
          if (security.status === "block") throw new Error(`Security reviewer blocked generated files: ${security.findings.join("; ")}`);
          const performance = performanceReviewWorkspaceFiles(files);
          await send("performance_reviewed", performance.summary, { performance });
          const changedFiles: Array<{ path: string; operation: string; added: number; removed: number; description?: string }> = [];
          for (const file of files) {
            if (!file.path) continue;
            await send("tool_start", `${file.operation === "create" ? "Creating" : file.operation === "delete" ? "Deleting" : "Editing"} ${file.path}`, { path: file.path, operation: file.operation });
            let oldContent = "";
            try {
              oldContent = await readProjectFile(session.user.id, project.id, file.path);
            } catch {}

            if (file.operation === "delete") await deleteProjectFile(session.user.id, project.id, file.path);
            else await writeProjectFile(session.user.id, project.id, file.path, file.content || "", oldContent ? "EDITED" : "CREATED");

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
            const eventType = file.operation === "create" ? "file_created" : file.operation === "delete" ? "file_deleted" : "file_updated";
            await send(eventType, `${file.operation === "create" ? "Created" : file.operation === "delete" ? "Deleted" : "Updated"} ${file.path}`, { path: file.path, operation: file.operation, added: diff.added, removed: diff.removed });
            await send("diff_ready", `Diff ready for ${file.path}`, { path: file.path, operation: file.operation, added: diff.added, removed: diff.removed });
          }

          await send("server_starting", "Starting preview");
          if (!previewGate.ok) throw new Error(`${previewGate.code}: ${previewGate.message}`);
          const verification = await verifyStaticPreview(session.user.id, project.id);
          await send("server_ready", "Preview URL ready", { url: verification.url });
          await send(verification.verified ? "preview_verified" : "error", verification.message, verification);
          if (!verification.verified) await send("error_fixed", "Preview issue recorded for debugger follow-up", { message: verification.message });

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

          const qualityScore = Math.max(0, Math.min(100, 68 + (verification.verified ? 20 : 0) + Math.min(12, changedFiles.length * 2)));
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
            include: { diffs: true, runs: true, previews: true, logs: true, events: { orderBy: { sequence: "asc" } } },
          });
          await prisma.workspaceProject.update({ where: { id: project.id }, data: { qualityScore, lastPreviewUrl: verification.url } });
          await createNotification({
            userId: session.user.id,
            type: verification.verified ? "agent_task_completed" : "agent_task_failed",
            actionUrl: `/workspace/${project.id}/ide`,
            variables: { taskName: project.name },
            metadata: { projectId: project.id, taskId: task.id, status: updatedTask.status, previewVerified: verification.verified },
            dedupeWindowMinutes: 0,
          }).catch(() => undefined);
          await send("finalized", "Finalized workspace task", {
            status: updatedTask.status,
            qualityScore,
            previewVerified: verification.verified,
          });
          const memory = memoryGate.ok ? await updateWorkspaceMemorySnapshot({
            userId: session.user.id,
            projectId: project.id,
            prompt: body.data.prompt,
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
          if (memory) await send("memory_updated", "Updated workspace memory", { recentTasks: memory.recentTasks.length, knownIssues: memory.knownIssues.length });
          const learning = await recordWorkspaceLearning({
            userId: session.user.id,
            projectId: project.id,
            taskId: task.id,
            prompt: body.data.prompt,
            classification: orchestration.classification,
            qualityScore,
            reviewer,
            security,
            performance,
            verification,
          });
          await send("learning_updated", "Recorded safe learning summary", { learning });
          const tokenUsage = usageFromCompletion(response.usage);
          const finalCredit = await calculateCredits({
            provider: response.provider || activeModel.provider,
            model: response.model || activeModel.model,
            ...tokenUsage,
            toolCalls: 8 + changedFiles.length,
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
            promptLength: body.data.prompt.length,
            contextTokens,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            reasoningTokens: tokenUsage.reasoningTokens,
            cachedTokens: tokenUsage.cachedTokens,
            estimated: tokenUsage.estimated,
            filesChanged: changedFiles.length,
            fileReads: context.relevantFiles.length,
            fileWrites: changedFiles.length,
            toolCalls: 8 + changedFiles.length,
            retries,
            autofixes,
            previewRuns: 1,
            previewVerified: verification.verified,
            breakdown: finalCredit.breakdown,
            },
          });
          await send("usage_recorded", "Recorded credit usage", {
            creditsUsed: finalCredit.credits,
            plan: usage.plan.name,
            monthly: usage.windows.MONTHLY,
            weekly: usage.windows.WEEKLY,
            fiveHour: usage.windows.FIVE_HOUR,
          });
          await send("summary", summary, { changedFiles, preview, verification, qualityScore, offlineMode, creditsUsed: finalCredit.credits });
          await send("done", "Task complete", { task: updatedTask, changedFiles, preview, verification, qualityScore, offlineMode, memory, creditsUsed: finalCredit.credits, usage });
          completed = true;
          controller.close();
        } catch (err) {
          if (taskId) {
            const status = request.signal.aborted || (err instanceof Error && err.message === "Task cancelled") ? "CANCELED" : "FAILED";
            await prisma.workspaceTask.update({
              where: { id: taskId },
              data: { status, summary: err instanceof Error ? err.message : "Workspace task failed", completedAt: new Date() },
            }).catch(() => undefined);
            if (status === "FAILED") {
              await createNotification({
                userId: session.user.id,
                type: "agent_task_failed",
                actionUrl: `/workspace/${id}/ide`,
                variables: { taskName: "Workspace task" },
                metadata: { projectId: id, taskId, error: err instanceof Error ? err.message : "Workspace task failed" },
                dedupeWindowMinutes: 0,
              }).catch(() => undefined);
            }
            await send(status === "CANCELED" ? "log" : "error", status === "CANCELED" ? "Task cancelled" : err instanceof Error ? err.message : "Workspace task failed").catch(() => undefined);
          }
          if (!completed) controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unable to start stream" }, { status: 400 });
  }
}
