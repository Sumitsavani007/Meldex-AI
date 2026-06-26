-- AI Workspace project/task storage.
-- Safe additive migration: creates new tables and indexes only.

CREATE TABLE "WorkspaceProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "storagePath" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "lastPreviewUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceFile" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UNCHANGED',
  "language" TEXT,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "planJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "summary" TEXT,
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "previewUrl" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceRun" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT,
  "command" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "exitCode" INTEGER,
  "stdout" TEXT,
  "stderr" TEXT,
  "durationMs" INTEGER,
  "previewUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceDiff" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "added" INTEGER NOT NULL DEFAULT 0,
  "removed" INTEGER NOT NULL DEFAULT 0,
  "oldContent" TEXT,
  "newContent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceDiff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspacePreview" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTING',
  "httpStatus" INTEGER,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspacePreview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT,
  "level" TEXT NOT NULL DEFAULT 'info',
  "event" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceProject_userId_slug_key" ON "WorkspaceProject"("userId", "slug");
CREATE INDEX "WorkspaceProject_userId_updatedAt_idx" ON "WorkspaceProject"("userId", "updatedAt");
CREATE INDEX "WorkspaceProject_status_idx" ON "WorkspaceProject"("status");

CREATE UNIQUE INDEX "WorkspaceFile_projectId_path_key" ON "WorkspaceFile"("projectId", "path");
CREATE INDEX "WorkspaceFile_projectId_status_idx" ON "WorkspaceFile"("projectId", "status");

CREATE INDEX "WorkspaceTask_userId_createdAt_idx" ON "WorkspaceTask"("userId", "createdAt");
CREATE INDEX "WorkspaceTask_projectId_createdAt_idx" ON "WorkspaceTask"("projectId", "createdAt");
CREATE INDEX "WorkspaceTask_status_idx" ON "WorkspaceTask"("status");

CREATE INDEX "WorkspaceRun_projectId_createdAt_idx" ON "WorkspaceRun"("projectId", "createdAt");
CREATE INDEX "WorkspaceRun_taskId_idx" ON "WorkspaceRun"("taskId");

CREATE INDEX "WorkspaceDiff_taskId_idx" ON "WorkspaceDiff"("taskId");
CREATE INDEX "WorkspaceDiff_path_idx" ON "WorkspaceDiff"("path");

CREATE INDEX "WorkspacePreview_projectId_createdAt_idx" ON "WorkspacePreview"("projectId", "createdAt");
CREATE INDEX "WorkspacePreview_taskId_idx" ON "WorkspacePreview"("taskId");

CREATE INDEX "WorkspaceLog_projectId_createdAt_idx" ON "WorkspaceLog"("projectId", "createdAt");
CREATE INDEX "WorkspaceLog_taskId_createdAt_idx" ON "WorkspaceLog"("taskId", "createdAt");
CREATE INDEX "WorkspaceLog_userId_idx" ON "WorkspaceLog"("userId");

ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceFile" ADD CONSTRAINT "WorkspaceFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceRun" ADD CONSTRAINT "WorkspaceRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceRun" ADD CONSTRAINT "WorkspaceRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceDiff" ADD CONSTRAINT "WorkspaceDiff_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspacePreview" ADD CONSTRAINT "WorkspacePreview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspacePreview" ADD CONSTRAINT "WorkspacePreview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceLog" ADD CONSTRAINT "WorkspaceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceLog" ADD CONSTRAINT "WorkspaceLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceLog" ADD CONSTRAINT "WorkspaceLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
