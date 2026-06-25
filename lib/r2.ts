/**
 * lib/r2.ts
 *
 * Cloudflare R2 Object Storage client using the AWS S3-compatible API.
 *
 * Folders (prefixes):
 *   avatars/    – user profile images
 *   projects/   – project-level assets
 *   uploads/    – general user uploads
 *   workspace/  – workspace file snapshots
 *   generated/  – AI-generated outputs
 *
 * When R2 credentials are not configured the module falls back gracefully:
 *   - isR2Configured() returns false
 *   - callers should use local filesystem as fallback
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

// ── R2 Folder prefixes ────────────────────────────────────────────────────────
export const R2_FOLDERS = {
  avatars: "avatars",
  projects: "projects",
  uploads: "uploads",
  workspace: "workspace",
  generated: "generated",
} as const;

export type R2Folder = keyof typeof R2_FOLDERS;

// ── Client singleton ──────────────────────────────────────────────────────────
let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "Cloudflare R2 is not configured. " +
      "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local"
    );
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return _client;
}

/**
 * Returns true if all required R2 environment variables are set.
 */
export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET
  );
}

// ── Path sanitization ─────────────────────────────────────────────────────────
function sanitizeKey(key: string): string {
  // Remove leading slashes, null bytes, and directory traversal attempts
  return key
    .replace(/\0/g, "")
    .replace(/\.\.\//g, "")
    .replace(/^\/+/, "")
    .trim();
}

/**
 * Build a full object key from folder + filename, safely.
 */
export function buildKey(folder: R2Folder, ...parts: string[]): string {
  const path = parts.map((p) => sanitizeKey(p)).filter(Boolean).join("/");
  return `${R2_FOLDERS[folder]}/${path}`;
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Upload a file to R2.
 */
export async function uploadToR2(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
}): Promise<{ key: string; publicUrl: string | null }> {
  const client = getClient();
  const key = sanitizeKey(params.key);

  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: params.body,
      ContentType: params.contentType ?? "application/octet-stream",
      Metadata: params.metadata,
    })
  );

  const publicUrl = env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL}/${key}` : null;

  return { key, publicUrl };
}

/**
 * Delete a single object from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: sanitizeKey(key),
    })
  );
}

/**
 * Delete multiple objects from R2 in a single batch request.
 */
export async function deleteManyFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const client = getClient();

  const objects: ObjectIdentifier[] = keys.map((k) => ({ Key: sanitizeKey(k) }));

  await client.send(
    new DeleteObjectsCommand({
      Bucket: env.R2_BUCKET,
      Delete: { Objects: objects, Quiet: true },
    })
  );
}

/**
 * Generate a time-limited signed URL for private object download.
 * Defaults to 1 hour expiry.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: sanitizeKey(key),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a presigned URL for direct client-side upload.
 * Defaults to 10 minute expiry.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 600
): Promise<string> {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: sanitizeKey(key),
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Check if a key exists in R2.
 */
export async function existsInR2(key: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: sanitizeKey(key),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * List all objects under a prefix (folder).
 */
export async function listR2Prefix(
  prefix: string,
  maxKeys = 1000
): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const client = getClient();
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: env.R2_BUCKET,
      Prefix: sanitizeKey(prefix),
      MaxKeys: maxKeys,
    })
  );

  return (result.Contents ?? []).map((obj) => ({
    key: obj.Key ?? "",
    size: obj.Size ?? 0,
    lastModified: obj.LastModified,
  }));
}

/**
 * Download a file from R2 as a Buffer.
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: sanitizeKey(key),
    })
  );

  if (!response.Body) {
    throw new Error(`R2 object not found: ${key}`);
  }

  // Stream → Buffer
  const chunks: Uint8Array[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Health-check: verify R2 connectivity by listing the bucket root.
 */
export async function checkR2Health(): Promise<{
  status: "ok" | "error" | "unconfigured";
  detail?: string;
  latencyMs?: number;
}> {
  if (!isR2Configured()) {
    return { status: "unconfigured", detail: "R2 credentials not set" };
  }

  const t0 = Date.now();
  try {
    const client = getClient();
    await client.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET,
        MaxKeys: 1,
      })
    );
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : "R2 unreachable",
      latencyMs: Date.now() - t0,
    };
  }
}
