/**
 * lib/secret-vault.ts
 *
 * AES-256-GCM encryption for storing secrets in the database.
 * Requires SETTINGS_ENCRYPTION_KEY env var (base64-encoded 32-byte key).
 *
 * Generate key:  openssl rand -base64 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// ── Key loading ─────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length})`
    );
  }
  return key;
}

export function isVaultConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

// ── Encryption ──────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext secret. Returns a base64-encoded blob:
 *   iv (12 bytes) || ciphertext || authTag (16 bytes)
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/**
 * Decrypt a previously encrypted blob. Returns the original plaintext.
 */
export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encrypted, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

// ── Masking ─────────────────────────────────────────────────────────────────

/**
 * Returns a safe masked representation, e.g.  sk-or-****abcd
 * Always shows at most last 4 chars. Short values are fully masked.
 */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  const prefix = value.slice(0, Math.min(6, Math.floor(value.length * 0.2)));
  const suffix = value.slice(-4);
  return `${prefix}****${suffix}`;
}

// ── DB operations ───────────────────────────────────────────────────────────

interface SaveSettingOptions {
  category?: string;
  isSecret?: boolean;
  requireRestart?: boolean;
  updatedBy?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Save a setting to the database. Secrets are encrypted before storage.
 * An audit log entry is created on every update.
 */
export async function saveSetting(
  key: string,
  value: string,
  opts: SaveSettingOptions = {}
): Promise<void> {
  const {
    category = "general",
    isSecret = false,
    requireRestart = false,
    updatedBy,
    ipAddress,
    userAgent,
  } = opts;

  // Get old value for audit
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  const oldMasked = existing?.valueMasked ?? null;

  const valueEncrypted = isSecret ? encryptSecret(value) : null;
  const valueMasked = isSecret ? maskSecret(value) : value;
  const newMasked = isSecret ? valueMasked : null;

  await prisma.systemSetting.upsert({
    where: { key },
    update: {
      valueEncrypted,
      valueMasked,
      category,
      isSecret,
      requireRestart,
      updatedBy,
    },
    create: {
      key,
      valueEncrypted,
      valueMasked,
      category,
      isSecret,
      requireRestart,
      updatedBy,
    },
  });

  await prisma.systemSettingAudit.create({
    data: {
      key,
      action: existing ? "UPDATE" : "CREATE",
      oldMasked,
      newMasked,
      updatedBy,
      ipAddress,
      userAgent,
    },
  });
}

/**
 * Retrieve the decrypted value of a setting.
 * Falls back to process.env if not found in DB.
 * Returns null if not found anywhere.
 */
export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return process.env[key] ?? null;
  if (row.isSecret && row.valueEncrypted) {
    try {
      return decryptSecret(row.valueEncrypted);
    } catch {
      return null;
    }
  }
  return row.valueMasked ?? null;
}

/**
 * Return a setting value safe to show in the UI (masked if secret).
 */
export async function getPublicSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) {
    const envVal = process.env[key];
    return envVal ? maskSecret(envVal) : null;
  }
  return row.valueMasked ?? null;
}

/**
 * Delete a setting and record audit.
 */
export async function deleteSetting(
  key: string,
  updatedBy?: string,
  ipAddress?: string
): Promise<void> {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) return;
  await prisma.systemSetting.delete({ where: { key } });
  await prisma.systemSettingAudit.create({
    data: {
      key,
      action: "DELETE",
      oldMasked: existing.valueMasked,
      newMasked: null,
      updatedBy,
      ipAddress,
    },
  });
}
