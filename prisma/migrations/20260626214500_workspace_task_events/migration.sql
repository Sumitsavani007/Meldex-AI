-- Workspace task event stream persistence.

CREATE TABLE "WorkspaceTaskEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceTaskEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceTaskEvent_taskId_sequence_key" ON "WorkspaceTaskEvent"("taskId", "sequence");
CREATE INDEX "WorkspaceTaskEvent_taskId_sequence_idx" ON "WorkspaceTaskEvent"("taskId", "sequence");
CREATE INDEX "WorkspaceTaskEvent_projectId_createdAt_idx" ON "WorkspaceTaskEvent"("projectId", "createdAt");

ALTER TABLE "WorkspaceTaskEvent" ADD CONSTRAINT "WorkspaceTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceTaskEvent" ADD CONSTRAINT "WorkspaceTaskEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
