import { z } from "zod";
import path from "path";

export const allowedCommands = [
  "npm install",
  "npm run dev",
  "npm run build",
  "npm test",
  "pnpm install",
  "pnpm dev",
  "pnpm build",
  "pnpm test",
  "yarn install",
  "yarn dev",
  "yarn build",
  "yarn test"
];

// Comprehensive list of dangerous commands that should never be allowed
export const blockedCommands = [
  "rm -rf",
  "rm -fr",
  "sudo",
  "shutdown",
  "reboot",
  "poweroff",
  "halt",
  "mkfs",
  "dd",
  "fdisk",
  "parted",
  "format",
  "disk",
  "partition",
  "fsck",
  "chkdsk",
  ">dev/null",
  "&& rm",
  "| rm",
  "chmod 777",
  "chown",
  "useradd",
  "userdel",
  "passwd",
  "su -",
  "sudo su",
  "/bin/bash",
  "/bin/sh",
  "curl.*|.*sh",
  "wget.*|.*sh",
];

export const blockedCommandPattern = new RegExp(
  `\\b(?:${blockedCommands.join("|")})\\b`,
  "i"
);

const rateLimitBucket = new Map<string, { count: number; resetAt: number }>();

// Dangerous path patterns
const dangerousPathPatterns = [
  /\.\.\//,  // Directory traversal
  /\.\.%2[fF]/,  // URL encoded directory traversal
  /^\//,  // Absolute paths in workspace context
  /^[a-zA-Z]:/,  // Windows drive letters
];

export function isBlockedCommand(command: string) {
  return blockedCommandPattern.test(command);
}

export function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

export function isSafeCommand(command: string) {
  const normalized = normalizeCommand(command);
  return !isBlockedCommand(normalized) && allowedCommands.includes(normalized);
}

export function sanitizePath(filePath: string): string {
  // Remove any null bytes
  let sanitized = filePath.replace(/\0/g, "");
  
  // Decode URL encoding if present
  try {
    sanitized = decodeURIComponent(sanitized);
  } catch {
    // If decoding fails, continue with original
  }
  
  // Normalize the path
  sanitized = path.normalize(sanitized);
  
  // Check for dangerous patterns
  for (const pattern of dangerousPathPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error("Invalid file path");
    }
  }
  
  return sanitized;
}

export function validateWorkspacePath(filePath: string, basePath: string): string {
  const sanitized = sanitizePath(filePath);
  const full = path.join(basePath, sanitized);
  const normalized = path.normalize(full);
  
  // Ensure the path stays within the workspace
  if (!normalized.startsWith(path.normalize(basePath))) {
    throw new Error("Path traversal attempt detected");
  }
  
  return normalized;
}

export function checkRateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const current = rateLimitBucket.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBucket.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;
  if (current.count > limit) {
    throw new Error("Rate limit exceeded. Please wait before retrying.");
  }
}

// CSRF Token validation using constant-time comparison
import crypto from "crypto";

export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Validate a CSRF token using constant-time comparison to prevent timing attacks.
 * The provided token is compared against the expected token stored in the session.
 */
export function validateCSRFToken(token: string, expectedToken: string): boolean {
  if (
    typeof token !== "string" ||
    typeof expectedToken !== "string" ||
    token.length !== expectedToken.length
  ) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(expectedToken, "hex")
    );
  } catch {
    return false;
  }
}

// Validate API requests
export function validateAPIKey(key: string | undefined): boolean {
  if (!key) return false;
  // API key should be a proper format (at least 32 characters)
  return typeof key === "string" && key.length >= 32;
}

// Input validation schemas
export const chatRequestSchema = z.object({
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).max(120).optional(),
  mode: z.enum(["chat", "agent"]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1).max(32000)
      })
    )
    .min(1)
    .max(40)
});

export const agentRequestSchema = z.object({
  task: z.string().min(1).max(12000),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).max(120).optional()
});

export const terminalRequestSchema = z.object({
  command: z.string().min(1).max(120),
  autoFix: z.boolean().optional(),
  timeoutMs: z.number().int().min(1000).max(180000).optional()
});

export const workspaceWriteSchema = z.object({
  action: z.enum(["file", "folder"]).optional(),
  path: z.string().min(1).max(500),
  content: z.string().max(1_500_000).optional()
});
