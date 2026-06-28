-- Meldex AI Studio V1
CREATE TABLE "StudioProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'TEXT_TO_VIDEO',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "styleLock" TEXT,
  "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
  "resolution" TEXT NOT NULL DEFAULT '1080p',
  "durationSec" INTEGER NOT NULL DEFAULT 8,
  "fps" INTEGER NOT NULL DEFAULT 24,
  "seed" TEXT,
  "settingsJson" JSONB,
  "archivedAt" TIMESTAMP(3),
  "favoritedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioGeneration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'TEXT_TO_VIDEO',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "sourcePrompt" TEXT NOT NULL,
  "detectedLanguage" TEXT,
  "enhancedPrompt" TEXT,
  "negativePrompt" TEXT,
  "storyboardJson" JSONB,
  "settingsJson" JSONB,
  "model" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'openrouter',
  "previewUrl" TEXT,
  "outputUrl" TEXT,
  "thumbnailUrl" TEXT,
  "error" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "etaSeconds" INTEGER,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioGeneration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioScene" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "generationId" TEXT,
  "order" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "negativePrompt" TEXT,
  "durationSec" INTEGER NOT NULL DEFAULT 4,
  "camera" TEXT,
  "emotion" TEXT,
  "lighting" TEXT,
  "environment" TEXT,
  "charactersJson" JSONB,
  "settingsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioScene_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "generationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'PREPARING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "queuePosition" INTEGER,
  "currentScene" INTEGER,
  "currentModel" TEXT,
  "logsJson" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "metadataJson" JSONB,
  "favoritedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioCharacter" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "faceAssetId" TEXT,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "memoryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioCharacter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioVoice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'AI_VOICE',
  "provider" TEXT,
  "voiceRef" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioVoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "prompt" TEXT NOT NULL,
  "settingsJson" JSONB,
  "thumbnailUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "generationId" TEXT,
  "action" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioProject_userId_slug_key" ON "StudioProject"("userId", "slug");
CREATE INDEX "StudioProject_userId_updatedAt_idx" ON "StudioProject"("userId", "updatedAt");
CREATE INDEX "StudioProject_userId_status_idx" ON "StudioProject"("userId", "status");
CREATE INDEX "StudioGeneration_userId_createdAt_idx" ON "StudioGeneration"("userId", "createdAt");
CREATE INDEX "StudioGeneration_projectId_createdAt_idx" ON "StudioGeneration"("projectId", "createdAt");
CREATE INDEX "StudioGeneration_status_idx" ON "StudioGeneration"("status");
CREATE INDEX "StudioScene_projectId_order_idx" ON "StudioScene"("projectId", "order");
CREATE INDEX "StudioScene_generationId_idx" ON "StudioScene"("generationId");
CREATE INDEX "StudioScene_userId_createdAt_idx" ON "StudioScene"("userId", "createdAt");
CREATE INDEX "StudioJob_userId_createdAt_idx" ON "StudioJob"("userId", "createdAt");
CREATE INDEX "StudioJob_projectId_createdAt_idx" ON "StudioJob"("projectId", "createdAt");
CREATE INDEX "StudioJob_generationId_idx" ON "StudioJob"("generationId");
CREATE INDEX "StudioJob_status_idx" ON "StudioJob"("status");
CREATE INDEX "StudioAsset_userId_createdAt_idx" ON "StudioAsset"("userId", "createdAt");
CREATE INDEX "StudioAsset_projectId_idx" ON "StudioAsset"("projectId");
CREATE INDEX "StudioAsset_type_idx" ON "StudioAsset"("type");
CREATE INDEX "StudioCharacter_userId_createdAt_idx" ON "StudioCharacter"("userId", "createdAt");
CREATE INDEX "StudioCharacter_projectId_idx" ON "StudioCharacter"("projectId");
CREATE INDEX "StudioVoice_userId_createdAt_idx" ON "StudioVoice"("userId", "createdAt");
CREATE INDEX "StudioVoice_projectId_idx" ON "StudioVoice"("projectId");
CREATE INDEX "StudioTemplate_category_idx" ON "StudioTemplate"("category");
CREATE INDEX "StudioTemplate_isActive_idx" ON "StudioTemplate"("isActive");
CREATE INDEX "StudioHistory_userId_createdAt_idx" ON "StudioHistory"("userId", "createdAt");
CREATE INDEX "StudioHistory_projectId_createdAt_idx" ON "StudioHistory"("projectId", "createdAt");
CREATE INDEX "StudioHistory_generationId_idx" ON "StudioHistory"("generationId");

ALTER TABLE "StudioProject" ADD CONSTRAINT "StudioProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioGeneration" ADD CONSTRAINT "StudioGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioGeneration" ADD CONSTRAINT "StudioGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioScene" ADD CONSTRAINT "StudioScene_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioScene" ADD CONSTRAINT "StudioScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioScene" ADD CONSTRAINT "StudioScene_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "StudioGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioJob" ADD CONSTRAINT "StudioJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioJob" ADD CONSTRAINT "StudioJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioJob" ADD CONSTRAINT "StudioJob_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "StudioGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioAsset" ADD CONSTRAINT "StudioAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAsset" ADD CONSTRAINT "StudioAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioCharacter" ADD CONSTRAINT "StudioCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioCharacter" ADD CONSTRAINT "StudioCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioVoice" ADD CONSTRAINT "StudioVoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioVoice" ADD CONSTRAINT "StudioVoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioHistory" ADD CONSTRAINT "StudioHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioHistory" ADD CONSTRAINT "StudioHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioHistory" ADD CONSTRAINT "StudioHistory_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "StudioGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
