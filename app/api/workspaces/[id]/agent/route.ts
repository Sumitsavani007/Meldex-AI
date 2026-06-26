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
  offlineStaticWorkspace,
  providerErrorResponse,
  readProjectFile,
  verifyStaticPreview,
  writeProjectFile,
  deleteProjectFile,
} from "@/lib/ai-workspace";
import { prisma } from "@/lib/prisma";
import type { WorkspaceAgentResponse } from "@/lib/ai-workspace";

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
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || `workspace-agent:${session.user.id}`, 12);
    const body = schema.parse(await request.json());
    const project = await getOwnedWorkspaceProject(session.user.id, id);

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

    const context = await buildWorkspaceContext(project.id, project.storagePath);
    let response: WorkspaceAgentResponse;
    let providerFailure: ReturnType<typeof classifyWorkspaceProviderFailure> | null = null;
    let offlineMode = false;
    try {
      response = await askWorkspaceAgent(body.prompt, context);
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
    const files = Array.isArray(response.files) ? response.files : [];
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
        status: verification.verified || changedFiles.length ? "SUCCEEDED" : "FAILED",
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
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (taskId) {
      await prisma.workspaceTask.update({
        where: { id: taskId },
        data: { status: "FAILED", summary: err instanceof Error ? err.message : "Workspace task failed", completedAt: new Date() },
      }).catch(() => undefined);
    }
    const provider = providerErrorResponse(err);
    return NextResponse.json(provider.body, { status: provider.status, headers: { "Cache-Control": "no-store" } });
  }
}
