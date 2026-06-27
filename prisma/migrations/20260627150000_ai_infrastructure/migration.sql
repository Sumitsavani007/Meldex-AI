ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'GOOGLE_GEMINI';
ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'GROQ';
ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'TOGETHER';
ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'LOCAL';

DO $$ BEGIN
  CREATE TYPE "QueueStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AbuseSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AiProviderConfig" (
  "id" TEXT NOT NULL,
  "provider" "ModelProvider" NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT,
  "apiKeySettingKey" TEXT,
  "defaultModel" TEXT NOT NULL,
  "fallbackModelsJson" JSONB,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
  "maxContextTokens" INTEGER NOT NULL DEFAULT 128000,
  "costMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "retryCount" INTEGER NOT NULL DEFAULT 1,
  "timeoutMs" INTEGER NOT NULL DEFAULT 90000,
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
  "rateLimitPerHour" INTEGER NOT NULL DEFAULT 1000,
  "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
  "healthScore" INTEGER NOT NULL DEFAULT 100,
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProviderHealthEvent" (
  "id" TEXT NOT NULL,
  "providerConfigId" TEXT,
  "provider" "ModelProvider" NOT NULL,
  "model" TEXT,
  "status" TEXT NOT NULL,
  "statusCode" INTEGER,
  "latencyMs" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderHealthEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiRequestQueue" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerConfigId" TEXT,
  "taskType" TEXT NOT NULL,
  "status" "QueueStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "etaSeconds" INTEGER,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiRequestQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RateLimitRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "requestsPerMinute" INTEGER NOT NULL DEFAULT 60,
  "requestsPerHour" INTEGER NOT NULL DEFAULT 1000,
  "requestsPerDay" INTEGER NOT NULL DEFAULT 10000,
  "burst" INTEGER NOT NULL DEFAULT 10,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AbuseEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "severity" "AbuseSeverity" NOT NULL DEFAULT 'LOW',
  "reason" TEXT NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AbuseEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserApiKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyLast4" TEXT NOT NULL,
  "scopesJson" JSONB,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiProviderConfig_provider_defaultModel_key" ON "AiProviderConfig"("provider", "defaultModel");
CREATE INDEX IF NOT EXISTS "AiProviderConfig_provider_isEnabled_idx" ON "AiProviderConfig"("provider", "isEnabled");
CREATE INDEX IF NOT EXISTS "AiProviderConfig_priority_idx" ON "AiProviderConfig"("priority");
CREATE INDEX IF NOT EXISTS "AiProviderConfig_healthStatus_idx" ON "AiProviderConfig"("healthStatus");
CREATE INDEX IF NOT EXISTS "ProviderHealthEvent_provider_createdAt_idx" ON "ProviderHealthEvent"("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "ProviderHealthEvent_status_idx" ON "ProviderHealthEvent"("status");
CREATE INDEX IF NOT EXISTS "ProviderHealthEvent_providerConfigId_idx" ON "ProviderHealthEvent"("providerConfigId");
CREATE INDEX IF NOT EXISTS "AiRequestQueue_userId_status_idx" ON "AiRequestQueue"("userId", "status");
CREATE INDEX IF NOT EXISTS "AiRequestQueue_status_priority_createdAt_idx" ON "AiRequestQueue"("status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "AiRequestQueue_providerConfigId_idx" ON "AiRequestQueue"("providerConfigId");
CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitRule_key_key" ON "RateLimitRule"("key");
CREATE INDEX IF NOT EXISTS "RateLimitRule_isEnabled_idx" ON "RateLimitRule"("isEnabled");
CREATE INDEX IF NOT EXISTS "AbuseEvent_userId_createdAt_idx" ON "AbuseEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AbuseEvent_type_severity_idx" ON "AbuseEvent"("type", "severity");
CREATE INDEX IF NOT EXISTS "AbuseEvent_blockedUntil_idx" ON "AbuseEvent"("blockedUntil");
CREATE UNIQUE INDEX IF NOT EXISTS "UserApiKey_keyHash_key" ON "UserApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "UserApiKey_userId_revokedAt_idx" ON "UserApiKey"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "UserApiKey_expiresAt_idx" ON "UserApiKey"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "ProviderHealthEvent" ADD CONSTRAINT "ProviderHealthEvent_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AiProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AiRequestQueue" ADD CONSTRAINT "AiRequestQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AiRequestQueue" ADD CONSTRAINT "AiRequestQueue_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AiProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
