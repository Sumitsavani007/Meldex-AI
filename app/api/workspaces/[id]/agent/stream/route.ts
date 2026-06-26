import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import {
  askWorkspaceAgent,
  buildWorkspaceContext,
  classifyWorkspaceProviderFailure,
  countDiff,
  createWorkspaceSnapshot,
  createWorkspaceTaskEvent,
  deleteProjectFile,
  getOwnedWorkspaceProject,
  offlineStaticWorkspace,
  readProjectFile,
  verifyStaticPreview,
  writeProjectFile,
  type WorkspaceAgentResponse,
  type WorkspaceStreamEvent,
} from "@/lib/ai-workspace";

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
          await prisma.workspaceTask.update({ where: { id: task.id }, data: { status: "RUNNING" } });
          await send("tool_start", "Reading workspace");
          const context = await buildWorkspaceContext(project.id, project.storagePath);
          await send("tool_result", "Read workspace", { files: context.projectFiles.length });
          await send("thinking", "Planning files");

          let response: WorkspaceAgentResponse;
          let offlineMode = false;
          let providerFailure: ReturnType<typeof classifyWorkspaceProviderFailure> | null = null;
          try {
            response = await askWorkspaceAgent(body.data.prompt, context);
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

          const files = Array.isArray(response.files) ? response.files : [];
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
          const verification = await verifyStaticPreview(session.user.id, project.id);
          await send("server_ready", "Preview URL ready", { url: verification.url });
          await send(verification.verified ? "preview_verified" : "error", verification.message, verification);

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
              status: verification.verified || changedFiles.length ? "SUCCEEDED" : "FAILED",
              planJson: plan,
              summary,
              qualityScore,
              previewUrl: verification.url,
              completedAt: new Date(),
            },
            include: { diffs: true, runs: true, previews: true, logs: true, events: { orderBy: { sequence: "asc" } } },
          });
          await prisma.workspaceProject.update({ where: { id: project.id }, data: { qualityScore, lastPreviewUrl: verification.url } });
          await send("summary", summary, { changedFiles, preview, verification, qualityScore, offlineMode });
          await send("done", "Task complete", { task: updatedTask, changedFiles, preview, verification, qualityScore, offlineMode });
          completed = true;
          controller.close();
        } catch (err) {
          if (taskId) {
            const status = request.signal.aborted || (err instanceof Error && err.message === "Task cancelled") ? "CANCELED" : "FAILED";
            await prisma.workspaceTask.update({
              where: { id: taskId },
              data: { status, summary: err instanceof Error ? err.message : "Workspace task failed", completedAt: new Date() },
            }).catch(() => undefined);
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
