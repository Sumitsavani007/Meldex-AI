-- Phase 2 Step 3: billing upgrade requests and notification-ready records.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UpgradeRequestStatus') THEN
    CREATE TYPE "UpgradeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "UpgradeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentPlanId" TEXT,
  "requestedPlanId" TEXT NOT NULL,
  "status" "UpgradeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "adminNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "bonusCredits" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UpgradeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UpgradeRequest_userId_status_idx" ON "UpgradeRequest"("userId", "status");
CREATE INDEX IF NOT EXISTS "UpgradeRequest_requestedPlanId_idx" ON "UpgradeRequest"("requestedPlanId");
CREATE INDEX IF NOT EXISTS "UpgradeRequest_createdAt_idx" ON "UpgradeRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "UserNotification_userId_readAt_idx" ON "UserNotification"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "UserNotification_type_idx" ON "UserNotification"("type");
CREATE INDEX IF NOT EXISTS "UserNotification_createdAt_idx" ON "UserNotification"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpgradeRequest_userId_fkey') THEN
    ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpgradeRequest_currentPlanId_fkey') THEN
    ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_currentPlanId_fkey" FOREIGN KEY ("currentPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UpgradeRequest_requestedPlanId_fkey') THEN
    ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_requestedPlanId_fkey" FOREIGN KEY ("requestedPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserNotification_userId_fkey') THEN
    ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
