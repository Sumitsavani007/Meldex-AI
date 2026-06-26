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
import { getProviderConfig } from "@/lib/runtime-config";

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
let _clientSignature = "";

async function getR2Config() {
  const cfg = await getProviderConfig("r2") as {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket?: string;
    publicUrl?: string;
  };
  return cfg;
}

async function getClient(): Promise<{ client: S3Client; bucket: string; publicUrl?: string }> {
  const cfg = await getR2Config();

  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error(
      "Cloudflare R2 is not configured. " +
      "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET in Master Panel"
    );
  }

  const signature = `${cfg.accountId}:${cfg.accessKeyId}:${cfg.bucket}`;
  if (!_client || _clientSignature !== signature) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    _clientSignature = signature;
  }

  return { client: _client, bucket: cfg.bucket, publicUrl: cfg.publicUrl };
}

/**
 * Returns true if all required R2 environment variables are set.
 */
export async function isR2Configured(): Promise<boolean> {
  const cfg = await getR2Config();
  return Boolean(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket);
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
  const { client, bucket, publicUrl: publicBaseUrl } = await getClient();
  const key = sanitizeKey(params.key);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.body,
      ContentType: params.contentType ?? "application/octet-stream",
      Metadata: params.metadata,
    })
  );

  const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${key}` : null;

  return { key, publicUrl };
}

/**
 * Delete a single object from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const { client, bucket } = await getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: sanitizeKey(key),
    })
  );
}

/**
 * Delete multiple objects from R2 in a single batch request.
 */
export async function deleteManyFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { client, bucket } = await getClient();

  const objects: ObjectIdentifier[] = keys.map((k) => ({ Key: sanitizeKey(k) }));

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
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
  const { client, bucket } = await getClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
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
  const { client, bucket } = await getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: sanitizeKey(key),
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Check if a key exists in R2.
 */
export async function existsInR2(key: string): Promise<boolean> {
  const { client, bucket } = await getClient();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
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
  const { client, bucket } = await getClient();
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
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
  const { client, bucket } = await getClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
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
  if (!(await isR2Configured())) {
    return { status: "unconfigured", detail: "R2 credentials not set" };
  }

  const t0 = Date.now();
  try {
    const { client, bucket } = await getClient();
    await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
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
