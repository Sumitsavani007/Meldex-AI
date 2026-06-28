import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { calculateCredits, canUseFeature, checkParallelTaskLimit, createUserNotification, featureBlockedResponse, getActiveGenerationModel, precheckUserAiRequest, recordAiCreditUsage, usageFromCompletion } from "@/lib/plans-credits";
import { createNotification } from "@/lib/notifications";
import { checkDynamicRateLimit, detectAbuse } from "@/lib/ai-infrastructure";
import { createWorkspaceEventBus } from "@/lib/workspace-event-bus";
import {
  askWorkspaceAgent,
  buildWorkspaceContext,
  classifyWorkspaceProviderFailure,
  countDiff,
  createWorkspaceSnapshot,
  deleteProjectFile,
  detectWorkspaceContextLeak,
  getOwnedWorkspaceProject,
  isStaticWebsitePrompt,
  normalizeWorkspaceFileActions,
  readProjectFile,
  syncWorkspaceFile,
  staticFileCompletenessIssues,
  staticFallbackFiles,
  updateWorkspaceMemorySnapshot,
  verifyStaticPreview,
  writeProjectFile,
  type WorkspaceAgentResponse,
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

function streamChunks(content = "") {
  const size = content.length > 18000 ? 2400 : content.length > 7000 ? 1400 : 850;
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += size) chunks.push(content.slice(index, index + size));
  return chunks.length ? chunks : [""];
}

function nowMs() {
  return Date.now();
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
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
    const abuseCheck = await detectAbuse({ userId: session.user.id, prompt: body.data.prompt, action: "agent_runs" });
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
        const taskStartedAt = nowMs();
        const timings: Record<string, unknown> = {
          taskStartedAt: new Date(taskStartedAt).toISOString(),
          promptChars: body.data.prompt.length,
        };
        let taskId: string | null = null;
        let completed = false;
        const eventBus = createWorkspaceEventBus({
          controller,
          encoder,
          userId: session.user.id,
          projectId: project.id,
          getTaskId: () => taskId,
          isAborted: () => request.signal.aborted,
        });
        const send = eventBus.emitWorkspaceEvent;

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

          timings.taskCreatedMs = elapsedMs(taskStartedAt);
          const snapshot = await createWorkspaceSnapshot(session.user.id, project.id, task.id);
          timings.snapshotCreatedMs = elapsedMs(taskStartedAt);
          await send("understanding_request", "Understanding request", { taskId, snapshotId: snapshot.id, elapsedMs: elapsedMs(taskStartedAt) });
          await send("native_prompt_expanding", "Expanding native language prompt", {
            sourceLanguage: /[\u0A80-\u0AFF]/.test(body.data.prompt) ? "gujarati" : /[\u0900-\u097F]/.test(body.data.prompt) ? "hindi" : "english",
            elapsedMs: elapsedMs(taskStartedAt),
          });
          await send("usage_checked", "Plan and credit limits checked", {
            estimatedCredits: preEstimate.credits,
            plan: creditCheck.summary.plan.name,
            model: activeModel.model,
          });
          await prisma.workspaceTask.update({ where: { id: task.id }, data: { status: "RUNNING" } });
          await send("loading_workspace", "Loading workspace");
          await send("tool_start", "Reading project structure");
          const workspaceReadStartedAt = nowMs();
          const context = await buildWorkspaceContext(project.id, project.storagePath, memoryGate.ok ? session.user.id : undefined, body.data.prompt);
          timings.workspaceReadMs = elapsedMs(workspaceReadStartedAt);
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
          await send("tool_result", "Read workspace", { files: context.projectFiles.length, elapsedMs: timings.workspaceReadMs });
          await send("relevant_files_searched", `Found ${context.relevantFiles.length} relevant file${context.relevantFiles.length === 1 ? "" : "s"}`, {
            files: context.relevantFiles.map((file) => file.path),
          });
          await send("memory_loaded", memoryGate.ok ? (context.memoryContext.relatedTaskCount ? "Loaded workspace memory and found related previous task" : "Loaded workspace memory") : "Workspace memory disabled by plan", {
            relatedTaskCount: memoryGate.ok ? context.memoryContext.relatedTaskCount : 0,
            reusedStyle: memoryGate.ok ? context.memoryContext.reusedStyle : false,
            avoidedIssue: memoryGate.ok ? context.memoryContext.avoidedIssue : false,
          });
          if (memoryGate.ok && context.memoryContext.reusedStyle) await send("memory_reused_style", "Reused project style from memory");
          if (memoryGate.ok && context.memoryContext.avoidedIssue) await send("memory_avoided_issue", "Avoided previous known issue");
          await send("dependencies_analyzed", "Analyzed dependencies", {
            packageFiles: context.projectFiles.filter((file) => /(^|\/)package\.json$|(^|\/)requirements\.txt$|(^|\/)composer\.json$|(^|\/)pyproject\.toml$/i.test(file)).length,
            contextTokens,
          });
          const fastStaticPath = isStaticWebsitePrompt(body.data.prompt) && !/\b(next|react|vite|api|backend|database|prisma|auth|dashboard|component|typescript|tsx)\b/i.test(body.data.prompt);
          const orchestration = fastStaticPath
            ? {
                classification: { type: "website_generation", subtype: "static_site_fast_path", labels: ["static", "fast_path", "dependency_free"] },
                confidence: { score: 0.91, decision: "auto_proceed" as const, reason: "Simple static website task uses fast path." },
                finalInstruction: [
                  "Static site fast path:",
                  "Create complete dependency-free index.html, style.css, and script.js.",
                  "index.html must link ./style.css and ./script.js.",
                  "style.css must be non-empty and premium-quality.",
                  "script.js must include real interactions for menus, FAQ, smooth scroll, or reveal animations when relevant.",
                  "Do not include raw JSON, markdown, placeholders, package.json, server files, .cache, or internal files.",
                ].join("\n"),
                events: [
                  { type: "intent_detected", message: "Intent detected", payload: { intent: { primary: "static_website_generation", secondary: [], flags: ["fast_path"] } } },
                  { type: "task_classified", message: "Classified task", payload: { classification: { type: "website_generation", subtype: "static_site_fast_path", labels: ["static", "fast_path"] } } },
                  { type: "planner_done", message: "Simple file plan ready", payload: { plan: { requiredFiles: ["index.html", "style.css", "script.js"], expectedSections: ["hero", "features", "plans", "faq"], validationPlan: ["file completeness", "preview HTTP 200"] } } },
                ],
              }
            : await runWorkspaceOrchestration({
                workspaceId: project.id,
                taskId: task.id,
                userId: session.user.id,
                prompt: body.data.prompt,
                workspaceContext: context,
                currentFiles: context.projectFiles,
                provider: "openrouter",
              });
          if (fastStaticPath) await send("static_fast_path_enabled", "Static website fast path enabled", { target: "model_call_under_5s" });
          for (const event of orchestration.events) await send(event.type, event.message, event.payload);
          if (orchestration.confidence.decision === "ask_user" || orchestration.confidence.decision === "block") {
            throw new Error(orchestration.confidence.reason);
          }
          await send("selecting_files", "Selecting files");

          let response: WorkspaceAgentResponse;
          const offlineMode = false;
          let retries = 0;
          let autofixes = 0;
          try {
            await send("qwen_generation_started", "Qwen generation started", {
              classification: orchestration.classification,
              confidence: orchestration.confidence.score,
              elapsedMs: elapsedMs(taskStartedAt),
            });
            await send("current_step", "Waiting for model response", { stage: "model_generation" });
            const stopHeartbeat = eventBus.heartbeat("Still working… waiting for model response", 2000);
            const modelStartedAt = nowMs();
            try {
              response = await askWorkspaceAgent(body.data.prompt, context, orchestration.finalInstruction, { userId: session.user.id, taskType: "workspace_agent_stream" });
            } finally {
              stopHeartbeat();
              timings.modelResponseMs = elapsedMs(modelStartedAt);
            }
            await send("model_response_received", "Model response received", { elapsedMs: timings.modelResponseMs });
            for (const runtimeEvent of response.runtimeV4?.events || []) {
              await send(runtimeEvent.type, runtimeEvent.message, runtimeEvent.payload);
            }
          } catch (providerError) {
            const providerFailure = classifyWorkspaceProviderFailure(providerError, body.data.prompt);
            await send("provider_failed", providerFailure.userMessage, {
              providerFailure,
              guard: "No generated files were saved because the provider failed before valid output.",
              elapsedMs: elapsedMs(taskStartedAt),
            });
            throw providerError;
          }

          const plan = Array.isArray(response.plan) ? response.plan.slice(0, 8) : ["Understand request", "Create files", "Verify preview"];
          await send("plan", `Planned ${plan.length} step${plan.length === 1 ? "" : "s"}`, { plan, offlineMode });
          await send("changes_planned", "Planned changes");

          const parseStartedAt = nowMs();
          let files = normalizeWorkspaceFileActions(Array.isArray(response.files) ? response.files : [], body.data.prompt);
          timings.parseMs = elapsedMs(parseStartedAt);
          if (response.runtimeV4?.reflection) {
            await send(
              (response.runtimeV4.reflection as { ok?: boolean }).ok ? "local_reflection_done" : "local_reflection_failed",
              (response.runtimeV4.reflection as { ok?: boolean }).ok ? "Local reflection passed" : "Local reflection requested targeted repair",
              { reflection: response.runtimeV4.reflection }
            );
          }
          await send("file_extracted", `Extracted ${files.length} file action${files.length === 1 ? "" : "s"}`, {
            files: files.map((file) => ({ path: file.path, operation: file.operation })),
            elapsedMs: timings.parseMs,
          });
          if (isStaticWebsitePrompt(body.data.prompt)) {
            const completenessIssues = staticFileCompletenessIssues(files, body.data.prompt);
            if (completenessIssues.length) {
              autofixes += 1;
              await send("file_completeness_repair", "Completing required static files", { issues: completenessIssues });
              files = normalizeWorkspaceFileActions(staticFallbackFiles(body.data.prompt, completenessIssues.join("; ")), body.data.prompt);
              response = {
                ...response,
                files,
                warnings: [...(response.warnings || []), `Static file completeness repair applied: ${completenessIssues.join("; ")}`],
              };
            } else {
              await send("file_completeness_verified", "Required static files verified", { files: ["index.html", "style.css", "script.js"] });
            }
          }
          if (!files.length && isStaticWebsitePrompt(body.data.prompt)) {
            if (!response.rawContent?.trim()) {
              await send("invalid_model_output", "Model returned no valid file actions; no files were saved", {
                promptType: "static_website",
                guard: "provider_error_save_guard",
              });
              throw new Error("Model returned no valid file actions; no files were saved.");
            }
            autofixes += 1;
            const fallbackFiles = staticFallbackFiles(body.data.prompt, "provider returned no extractable file actions after successful response");
            files = normalizeWorkspaceFileActions(fallbackFiles, body.data.prompt);
            response = {
              ...response,
              files,
              summary: response.summary || "Provider returned a valid response; Meldex repaired it into complete static files.",
              warnings: [...(response.warnings || []), "Provider response had no extractable file actions; static file repair generated required files."],
            };
            await send("debugger_fix_applied", "Debugger generated required static files after successful but non-file model response", {
              fixed: files.length > 0,
              files: files.map((file) => ({ path: file.path, operation: file.operation })),
            });
          }
          let leakCheck = detectWorkspaceContextLeak(files, body.data.prompt);
          if (!leakCheck.ok) {
            retries += 1;
            await send("context_leak_detected", "Checking output", {
              missing: leakCheck.missingRequiredEntities,
              repairHints: leakCheck.repairHints,
              domain: leakCheck.domain,
            });
            await send("current_step", `Repairing ${leakCheck.missingRequiredEntities[0] || "current prompt"} context`, {
              domain: leakCheck.domain,
            });
            const isolationPrompt = `${body.data.prompt}

TASK ISOLATION FIX:
- The previous generation did not match the current prompt.
- Ignore old workspace content and memory except generic coding/style preferences.
- Do not reuse old pricing, food, or unrelated page copy.
- Generate complete files for ONLY the current prompt.
- Return JSON only with complete file contents.`;
            const stopRepairHeartbeat = eventBus.heartbeat("Still working… repairing output", 2000);
            let isolatedResponse: WorkspaceAgentResponse | null = null;
            try {
              isolatedResponse = await askWorkspaceAgent(isolationPrompt, { ...context, relevantFiles: [], memoryContext: { ...context.memoryContext, snippet: "" } }, orchestration.finalInstruction, { userId: session.user.id, taskType: "workspace_isolation_fix" });
            } catch (repairError) {
              await send("context_leak_warning", "Repair pass failed; continuing with generated files", {
                reason: repairError instanceof Error ? repairError.message : "Repair pass failed",
                domain: leakCheck.domain,
              });
            } finally {
              stopRepairHeartbeat();
            }
            if (isolatedResponse) {
              files = normalizeWorkspaceFileActions(Array.isArray(isolatedResponse.files) ? isolatedResponse.files : [], body.data.prompt);
              leakCheck = detectWorkspaceContextLeak(files, body.data.prompt);
              if (!leakCheck.ok && isStaticWebsitePrompt(body.data.prompt)) {
                response = {
                  ...response,
                  warnings: [...(response.warnings || []), `Context validation warning: ${leakCheck.findings.join("; ")}`],
                };
              }
              response = { ...response, files, summary: isolatedResponse.summary || response.summary, warnings: [...(response.warnings || []), ...(isolatedResponse.warnings || []), ...leakCheck.findings] };
            }
            await send(leakCheck.ok ? "context_leak_fixed" : "context_leak_warning", leakCheck.ok ? "Auto repair completed" : "Continuing with validation warning", {
              missing: leakCheck.missingRequiredEntities,
              repairHints: leakCheck.repairHints,
              domain: leakCheck.domain,
            });
          }
          if (!leakCheck.ok) {
            response = {
              ...response,
              warnings: [
                ...(response.warnings || []),
                `Output validation warning: ${leakCheck.missingRequiredEntities[0] || "current prompt context"} may need review.`,
              ],
            };
          }
          if (leakCheck.repairRecommended) {
            await send("output_repair_recommended", "Output may need a small repair", {
              repairHints: leakCheck.repairHints,
              optionalRequirements: leakCheck.optionalRequirements,
            });
          }

          let reviewer = reviewWorkspaceFiles(files, orchestration.classification, body.data.prompt);
          if (reviewer.status === "block") {
            retries += 1;
            await send("reviewer_needs_fix", reviewer.summary, { reviewer });
            const fixPrompt = `${body.data.prompt}\n\nTARGETED FIX REQUIRED:\n${reviewer.findings.join("\n")}\nReturn complete corrected index.html, style.css, script.js, and README.md only.`;
            const fixResponse = await askWorkspaceAgent(fixPrompt, context, orchestration.finalInstruction, { userId: session.user.id, taskType: "workspace_autofix" });
            files = normalizeWorkspaceFileActions(Array.isArray(fixResponse.files) ? fixResponse.files : [], body.data.prompt);
            if (!files.length && isStaticWebsitePrompt(body.data.prompt)) {
              throw new Error("Targeted regeneration returned no valid file actions; no files were saved.");
            }
            reviewer = reviewWorkspaceFiles(files, orchestration.classification, body.data.prompt);
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
          await send("file_operation_queue_created", `Queued ${files.length} file operation${files.length === 1 ? "" : "s"}`, {
            operations: files.map((file, index) => ({ index, path: file.path, operation: file.operation })),
          });
          for (const [index, file] of files.entries()) {
            if (!file.path) continue;
            await send("file_operation_queued", `Queued ${file.operation} ${file.path}`, { index, path: file.path, operation: file.operation });
          }
          for (const file of files) {
            const fileStartedAt = nowMs();
            if (!file.path) continue;
            await send("file_operation_started", `${file.operation === "create" ? "Creating" : file.operation === "delete" ? "Deleting" : "Editing"} ${file.path}`, { path: file.path, operation: file.operation });
            await send("tool_start", `${file.operation === "create" ? "Creating" : file.operation === "delete" ? "Deleting" : "Editing"} ${file.path}`, { path: file.path, operation: file.operation });
            let oldContent = "";
            try {
              oldContent = await readProjectFile(session.user.id, project.id, file.path);
            } catch {}

            await send("activeFile", `Active file ${file.path}`, { path: file.path, operation: file.operation });
            await send("editorOpenFile", `Opening ${file.path}`, { path: file.path, operation: file.operation, content: oldContent });
            await send("file_opened", `Opening ${file.path}`, {
              path: file.path,
              operation: file.operation,
              content: oldContent,
            });

            if (file.operation === "delete") {
              await send("editorSaveState", `Deleting ${file.path}`, { path: file.path, operation: file.operation, state: "saving" });
              await send("file_save_started", `Deleting ${file.path}`, { path: file.path, operation: file.operation });
              await deleteProjectFile(session.user.id, project.id, file.path);
              await send("file_saved", `Deleted ${file.path}`, { path: file.path, operation: file.operation, content: "" });
              await send("file_operation_completed", `Completed delete ${file.path}`, { path: file.path, operation: file.operation });
            } else {
              const finalContent = file.content || "";
              if (!finalContent.trim()) {
                await send("error", `Refusing to save empty generated content for ${file.path}`, { path: file.path, operation: file.operation });
                throw new Error(`Generated content for ${file.path} was empty.`);
              }
              const initialStatus = oldContent ? "EDITING" : "CREATING";
              await syncWorkspaceFile(session.user.id, project.id, file.path, oldContent, initialStatus);
              await send(file.operation === "create" ? "creating_file" : "updating_file", `${file.operation === "create" ? "Creating" : "Updating"} ${file.path}`, { path: file.path, operation: file.operation });
              await send("explorerRefresh", `Explorer updated for ${file.path}`, { path: file.path, operation: file.operation, status: initialStatus });
              await send("file_writing", `Writing ${file.path}`, { path: file.path, operation: file.operation, totalBytes: Buffer.byteLength(finalContent) });
              await send("file_write_started", `Writing ${file.path}`, {
                path: file.path,
                operation: file.operation,
                totalBytes: Buffer.byteLength(finalContent),
              });
              let draft = "";
              for (const chunk of streamChunks(finalContent)) {
                draft += chunk;
                await writeProjectFile(session.user.id, project.id, file.path, draft, initialStatus);
                await send("editorApplyChunk", `Applying changes to ${file.path}`, {
                  path: file.path,
                  operation: file.operation,
                  chunk,
                  writtenBytes: Buffer.byteLength(draft),
                  totalBytes: Buffer.byteLength(finalContent),
                });
                await send("file_progress", `Writing ${file.path}`, {
                  path: file.path,
                  operation: file.operation,
                  writtenBytes: Buffer.byteLength(draft),
                  totalBytes: Buffer.byteLength(finalContent),
                  percent: finalContent ? Math.min(100, Math.round((Buffer.byteLength(draft) / Buffer.byteLength(finalContent)) * 100)) : 100,
                });
                await send("file_write_chunk", `Writing ${file.path}`, {
                  path: file.path,
                  operation: file.operation,
                  chunk,
                  writtenBytes: Buffer.byteLength(draft),
                  totalBytes: Buffer.byteLength(finalContent),
                });
              }
              await send("editorSaveState", `Saving ${file.path}`, { path: file.path, operation: file.operation, state: "saving" });
              await send("file_save_started", `Saving ${file.path}`, { path: file.path, operation: file.operation });
              await writeProjectFile(session.user.id, project.id, file.path, finalContent, oldContent ? "EDITED" : "CREATED");
              timings[`file:${file.path}:writeMs`] = elapsedMs(fileStartedAt);
              await send("file_saved", `Saved ${file.path}`, {
                path: file.path,
                operation: file.operation,
                content: finalContent,
                elapsedMs: timings[`file:${file.path}:writeMs`],
              });
              await send("editorSaveState", `Saved ${file.path}`, { path: file.path, operation: file.operation, state: "saved" });
              await send("explorerRefresh", `Explorer updated for ${file.path}`, { path: file.path, operation: file.operation, status: oldContent ? "EDITED" : "CREATED" });
              await send("file_operation_completed", `Completed ${file.operation} ${file.path}`, { path: file.path, operation: file.operation });
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
            const eventType = file.operation === "create" ? "file_created" : file.operation === "delete" ? "file_deleted" : "file_updated";
            await send(eventType, `${file.operation === "create" ? "Created" : file.operation === "delete" ? "Deleted" : "Updated"} ${file.path}`, { path: file.path, operation: file.operation, added: diff.added, removed: diff.removed });
            await send("diff_ready", `Diff ready for ${file.path}`, { path: file.path, operation: file.operation, added: diff.added, removed: diff.removed });
          }

          if (isStaticWebsitePrompt(body.data.prompt)) {
            const finalCompletenessIssues = staticFileCompletenessIssues(files, body.data.prompt);
            if (finalCompletenessIssues.length) {
              await send("error", "Static file completeness check failed before preview", { issues: finalCompletenessIssues });
              throw new Error(`Static file completeness check failed: ${finalCompletenessIssues.join("; ")}`);
            }
          }
          await send("previewStatus", "Running preview", { status: "starting" });
          await send("server_starting", "Starting preview");
          if (!previewGate.ok) throw new Error(`${previewGate.code}: ${previewGate.message}`);
          const previewStartedAt = nowMs();
          const verification = await verifyStaticPreview(session.user.id, project.id);
          timings.previewVerifyMs = elapsedMs(previewStartedAt);
          await send("previewStatus", verification.verified ? "Preview verified" : "Preview needs repair", { status: verification.verified ? "verified" : "failed", verification });
          await send("server_ready", "Preview URL ready", { url: verification.url });
          await send(verification.verified ? "preview_verified" : "error", verification.message, { ...verification, elapsedMs: timings.previewVerifyMs });
          if (!verification.verified) throw new Error(verification.message);

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
          const summary = response.summary || (changedFiles.length ? "Done — workspace task completed and preview checked." : "No file edits were returned.");
          timings.totalBeforeDbFinalizeMs = elapsedMs(taskStartedAt);
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
          await send("taskStatus", updatedTask.status === "SUCCEEDED" ? "Task completed successfully" : "Task finished with issues", {
            status: updatedTask.status,
            taskId: task.id,
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
          if (response.runtimeV4?.scratchpad) {
            await send("scratchpad_finalized", "Finalized task scratchpad", {
              scratchpad: {
                ...(response.runtimeV4.scratchpad as Record<string, unknown>),
                currentStatus: updatedTask.status === "SUCCEEDED" ? "completed" : "blocked",
                finalResult: summary,
              },
            });
          }
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
          timings.totalMs = elapsedMs(taskStartedAt);
          await send("speed_benchmark", "Workspace speed benchmark recorded", {
            timings,
            target: "BookNest prompt should stream first event immediately and avoid silent batching.",
          });
          await send("summary", summary, { changedFiles, preview, verification, qualityScore, offlineMode, creditsUsed: finalCredit.credits });
          await send("done", "Task complete", { task: updatedTask, changedFiles, preview, verification, qualityScore, offlineMode, memory, creditsUsed: finalCredit.credits, usage, timings });
          completed = true;
          try {
            controller.close();
          } catch {}
        } catch (err) {
          if (taskId) {
            const status = err instanceof Error && err.message === "Task cancelled" ? "CANCELED" : "FAILED";
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
          if (!completed) {
            try {
              controller.close();
            } catch {}
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unable to start stream" }, { status: 400 });
  }
}
