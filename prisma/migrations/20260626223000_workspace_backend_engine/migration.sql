-- Workspace V1 Part 3: ownership, soft-delete metadata, previews, and snapshots.

ALTER TABLE "WorkspaceProject"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceFile"
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ADD COLUMN IF NOT EXISTS "changed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "WorkspaceFile" wf
SET "userId" = wp."userId"
FROM "WorkspaceProject" wp
WHERE wf."projectId" = wp."id" AND wf."userId" IS NULL;

ALTER TABLE "WorkspaceFile"
ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "WorkspaceRun"
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "WorkspaceRun" wr
SET "userId" = wp."userId"
FROM "WorkspaceProject" wp
WHERE wr."projectId" = wp."id" AND wr."userId" IS NULL;

ALTER TABLE "WorkspaceRun"
ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "WorkspaceDiff"
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ADD COLUMN IF NOT EXISTS "projectId" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "WorkspaceDiff" wd
SET "userId" = wt."userId",
    "projectId" = wt."projectId"
FROM "WorkspaceTask" wt
WHERE wd."taskId" = wt."id" AND (wd."userId" IS NULL OR wd."projectId" IS NULL);

ALTER TABLE "WorkspaceDiff"
ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "projectId" SET NOT NULL;

ALTER TABLE "WorkspacePreview"
ADD COLUMN IF NOT EXISTS "userId" TEXT,
ADD COLUMN IF NOT EXISTS "port" INTEGER,
ADD COLUMN IF NOT EXISTS "logs" JSONB,
ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "WorkspacePreview" wpv
SET "userId" = wp."userId"
FROM "WorkspaceProject" wp
WHERE wpv."projectId" = wp."id" AND wpv."userId" IS NULL;

ALTER TABLE "WorkspacePreview"
ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "WorkspaceTaskEvent"
ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "WorkspaceTaskEvent" wte
SET "userId" = wt."userId"
FROM "WorkspaceTask" wt
WHERE wte."taskId" = wt."id" AND wte."userId" IS NULL;

ALTER TABLE "WorkspaceTaskEvent"
ALTER COLUMN "userId" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "WorkspaceSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT,
  "label" TEXT,
  "snapshotJson" JSONB NOT NULL,
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkspaceSnapshot_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceFile_userId_fkey') THEN
    ALTER TABLE "WorkspaceFile" ADD CONSTRAINT "WorkspaceFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceRun_userId_fkey') THEN
    ALTER TABLE "WorkspaceRun" ADD CONSTRAINT "WorkspaceRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceDiff_userId_fkey') THEN
    ALTER TABLE "WorkspaceDiff" ADD CONSTRAINT "WorkspaceDiff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceDiff_projectId_fkey') THEN
    ALTER TABLE "WorkspaceDiff" ADD CONSTRAINT "WorkspaceDiff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspacePreview_userId_fkey') THEN
    ALTER TABLE "WorkspacePreview" ADD CONSTRAINT "WorkspacePreview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceTaskEvent_userId_fkey') THEN
    ALTER TABLE "WorkspaceTaskEvent" ADD CONSTRAINT "WorkspaceTaskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceSnapshot_userId_fkey') THEN
    ALTER TABLE "WorkspaceSnapshot" ADD CONSTRAINT "WorkspaceSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceSnapshot_projectId_fkey') THEN
    ALTER TABLE "WorkspaceSnapshot" ADD CONSTRAINT "WorkspaceSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceSnapshot_taskId_fkey') THEN
    ALTER TABLE "WorkspaceSnapshot" ADD CONSTRAINT "WorkspaceSnapshot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WorkspaceProject_userId_deletedAt_idx" ON "WorkspaceProject"("userId", "deletedAt");
CREATE INDEX IF NOT EXISTS "WorkspaceFile_userId_updatedAt_idx" ON "WorkspaceFile"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "WorkspaceFile_projectId_deletedAt_idx" ON "WorkspaceFile"("projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "WorkspaceRun_userId_createdAt_idx" ON "WorkspaceRun"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceDiff_userId_createdAt_idx" ON "WorkspaceDiff"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceDiff_projectId_createdAt_idx" ON "WorkspaceDiff"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspacePreview_userId_createdAt_idx" ON "WorkspacePreview"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceTaskEvent_userId_createdAt_idx" ON "WorkspaceTaskEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceSnapshot_userId_createdAt_idx" ON "WorkspaceSnapshot"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceSnapshot_projectId_createdAt_idx" ON "WorkspaceSnapshot"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceSnapshot_taskId_idx" ON "WorkspaceSnapshot"("taskId");
