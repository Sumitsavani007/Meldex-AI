DO $$ BEGIN
  CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'SECURITY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
  "actionUrl" TEXT,
  "readAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "subject" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "variablesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailDeliveryLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "templateId" TEXT,
  "type" TEXT NOT NULL,
  "toEmail" TEXT,
  "subject" TEXT,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "error" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_severity_idx" ON "Notification"("severity");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_type_channel_key" ON "NotificationTemplate"("type", "channel");
CREATE INDEX IF NOT EXISTS "NotificationTemplate_type_idx" ON "NotificationTemplate"("type");
CREATE INDEX IF NOT EXISTS "NotificationTemplate_channel_isEnabled_idx" ON "NotificationTemplate"("channel", "isEnabled");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");
CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");
CREATE INDEX IF NOT EXISTS "EmailDeliveryLog_userId_createdAt_idx" ON "EmailDeliveryLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailDeliveryLog_type_status_idx" ON "EmailDeliveryLog"("type", "status");
CREATE INDEX IF NOT EXISTS "EmailDeliveryLog_templateId_idx" ON "EmailDeliveryLog"("templateId");

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmailDeliveryLog" ADD CONSTRAINT "EmailDeliveryLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
