-- Phase 2 Step 1: SaaS plans, user assignments, credit windows, and ledger.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserPlanStatus') THEN
    CREATE TYPE "UserPlanStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UsageWindowType') THEN
    CREATE TYPE "UsageWindowType" AS ENUM ('FIVE_HOUR', 'WEEKLY', 'MONTHLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreditTransactionType') THEN
    CREATE TYPE "CreditTransactionType" AS ENUM ('USAGE', 'GRANT', 'RESET', 'REFUND', 'ADMIN_ADJUSTMENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Plan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "priceMonthly" INTEGER NOT NULL DEFAULT 0,
  "priceYearly" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "monthlyCredits" INTEGER NOT NULL DEFAULT 0,
  "weeklyCredits" INTEGER NOT NULL DEFAULT 0,
  "fiveHourCredits" INTEGER NOT NULL DEFAULT 0,
  "maxContextTokens" INTEGER NOT NULL DEFAULT 128000,
  "maxWorkspaceCount" INTEGER NOT NULL DEFAULT 3,
  "maxStorageMb" INTEGER NOT NULL DEFAULT 500,
  "maxParallelTasks" INTEGER NOT NULL DEFAULT 1,
  "priorityLevel" INTEGER NOT NULL DEFAULT 1,
  "allowedModelsJson" JSONB,
  "featuresJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "UserPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "assignedByAdmin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UsageWindow" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "windowType" "UsageWindowType" NOT NULL,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "creditsLimit" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UsageWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "credits" INTEGER NOT NULL,
  "reason" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_slug_key" ON "Plan"("slug");
CREATE INDEX IF NOT EXISTS "Plan_isActive_sortOrder_idx" ON "Plan"("isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "Plan_priorityLevel_idx" ON "Plan"("priorityLevel");
CREATE INDEX IF NOT EXISTS "UserPlan_userId_status_idx" ON "UserPlan"("userId", "status");
CREATE INDEX IF NOT EXISTS "UserPlan_planId_idx" ON "UserPlan"("planId");
CREATE INDEX IF NOT EXISTS "UserPlan_startsAt_endsAt_idx" ON "UserPlan"("startsAt", "endsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "UsageWindow_userId_windowType_startsAt_key" ON "UsageWindow"("userId", "windowType", "startsAt");
CREATE INDEX IF NOT EXISTS "UsageWindow_userId_windowType_resetAt_idx" ON "UsageWindow"("userId", "windowType", "resetAt");
CREATE INDEX IF NOT EXISTS "UsageWindow_planId_idx" ON "UsageWindow"("planId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditTransaction_planId_idx" ON "CreditTransaction"("planId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_type_idx" ON "CreditTransaction"("type");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPlan_userId_fkey') THEN
    ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPlan_planId_fkey') THEN
    ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageWindow_userId_fkey') THEN
    ALTER TABLE "UsageWindow" ADD CONSTRAINT "UsageWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageWindow_planId_fkey') THEN
    ALTER TABLE "UsageWindow" ADD CONSTRAINT "UsageWindow_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditTransaction_userId_fkey') THEN
    ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditTransaction_planId_fkey') THEN
    ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "Plan" (
  "id", "name", "slug", "description", "priceMonthly", "priceYearly", "currency",
  "monthlyCredits", "weeklyCredits", "fiveHourCredits", "maxContextTokens",
  "maxWorkspaceCount", "maxStorageMb", "maxParallelTasks", "priorityLevel",
  "allowedModelsJson", "featuresJson", "isActive", "sortOrder"
) VALUES
  ('plan_free', 'Free', 'free', 'Starter access for trying Meldex.', 0, 0, 'USD', 1000, 300, 50, 128000, 3, 500, 1, 1, '["qwen/qwen3-coder-30b-a3b-instruct"]'::jsonb, '["Basic workspace", "AI chat", "Offline mode"]'::jsonb, true, 10),
  ('plan_plus', 'Meldex Plus', 'meldex-plus', 'More credits and larger workspaces for active builders.', 1900, 19000, 'USD', 10000, 3000, 500, 500000, 20, 10000, 2, 2, '["qwen/qwen3-coder-30b-a3b-instruct"]'::jsonb, '["Priority workspace runs", "Extension tokens", "Memory"]'::jsonb, true, 20),
  ('plan_pro', 'Meldex Pro', 'meldex-pro', 'Professional limits for serious product work.', 4900, 49000, 'USD', 50000, 15000, 2500, 1000000, 100, 50000, 4, 3, '["qwen/qwen3-coder-30b-a3b-instruct"]'::jsonb, '["Higher context", "More workspaces", "Priority model access"]'::jsonb, true, 30),
  ('plan_pro_plus', 'Meldex Pro+', 'meldex-pro-plus', 'Highest limits for power users and teams.', 9900, 99000, 'USD', 200000, 50000, 10000, 2000000, 500, 200000, 8, 4, '["qwen/qwen3-coder-30b-a3b-instruct"]'::jsonb, '["Maximum credits", "Largest context", "Top priority"]'::jsonb, true, 40)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = COALESCE("Plan"."description", EXCLUDED."description"),
  "updatedAt" = CURRENT_TIMESTAMP;
