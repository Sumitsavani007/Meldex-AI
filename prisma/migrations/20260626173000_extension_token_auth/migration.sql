-- Extension token metadata for SaaS token portal and secure masking.
ALTER TABLE "ExtensionToken"
  ADD COLUMN IF NOT EXISTS "tokenPrefix" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenLast4" TEXT,
  ADD COLUMN IF NOT EXISTS "scopesJson" JSONB,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ExtensionToken_revokedAt_idx" ON "ExtensionToken"("revokedAt");
CREATE INDEX IF NOT EXISTS "ExtensionToken_expiresAt_idx" ON "ExtensionToken"("expiresAt");

-- One-time device-code connect flow for VS Code Google/web login.
CREATE TABLE IF NOT EXISTS "ExtensionDeviceCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "deviceCode" TEXT NOT NULL,
  "userCode" TEXT NOT NULL,
  "tokenPlain" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExtensionDeviceCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionDeviceCode_deviceCode_key" ON "ExtensionDeviceCode"("deviceCode");
CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionDeviceCode_userCode_key" ON "ExtensionDeviceCode"("userCode");
CREATE INDEX IF NOT EXISTS "ExtensionDeviceCode_userCode_idx" ON "ExtensionDeviceCode"("userCode");
CREATE INDEX IF NOT EXISTS "ExtensionDeviceCode_deviceCode_idx" ON "ExtensionDeviceCode"("deviceCode");
CREATE INDEX IF NOT EXISTS "ExtensionDeviceCode_expiresAt_idx" ON "ExtensionDeviceCode"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExtensionDeviceCode_userId_fkey'
  ) THEN
    ALTER TABLE "ExtensionDeviceCode"
      ADD CONSTRAINT "ExtensionDeviceCode_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
