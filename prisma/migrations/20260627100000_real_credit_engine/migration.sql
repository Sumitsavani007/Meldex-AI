-- Phase 2 Step 2: real model/tool credit pricing config.

CREATE TABLE IF NOT EXISTS "ModelUsageConfig" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputCreditMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "outputCreditMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "reasoningCreditMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 3,
  "cachedCreditMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "toolCallCreditCost" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "previewCreditCost" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "fileReadCreditCost" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  "fileWriteCreditCost" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "memoryReadCreditCost" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  "memoryWriteCreditCost" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "fallbackEstimateCredits" INTEGER NOT NULL DEFAULT 15,
  "retryMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
  "autofixMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModelUsageConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ModelUsageConfig_provider_model_key" ON "ModelUsageConfig"("provider", "model");
CREATE INDEX IF NOT EXISTS "ModelUsageConfig_provider_isActive_idx" ON "ModelUsageConfig"("provider", "isActive");
CREATE INDEX IF NOT EXISTS "ModelUsageConfig_model_idx" ON "ModelUsageConfig"("model");

INSERT INTO "ModelUsageConfig" (
  "id", "provider", "model", "inputCreditMultiplier", "outputCreditMultiplier",
  "reasoningCreditMultiplier", "cachedCreditMultiplier", "toolCallCreditCost",
  "previewCreditCost", "fileReadCreditCost", "fileWriteCreditCost",
  "memoryReadCreditCost", "memoryWriteCreditCost", "fallbackEstimateCredits",
  "retryMultiplier", "autofixMultiplier", "isActive"
) VALUES (
  'model_usage_openrouter_qwen3_coder',
  'openrouter',
  'qwen/qwen3-coder-30b-a3b-instruct',
  1,
  2,
  3,
  0.25,
  1,
  2,
  0.2,
  1,
  0.2,
  0.5,
  15,
  1.25,
  1.5,
  true
)
ON CONFLICT ("provider", "model") DO UPDATE SET
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Plan"
SET "allowedModelsJson" = '["qwen/qwen3-coder-30b-a3b-instruct","qwen/qwen3-coder:free"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "allowedModelsJson" = '["qwen/qwen3-coder-30b-a3b-instruct"]'::jsonb;
