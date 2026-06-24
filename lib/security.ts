import { z } from "zod";

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

export const blockedCommandPattern = /\b(?:rm\s+-rf|sudo|shutdown|reboot|mkfs|dd)\b/i;

const rateLimitBucket = new Map<string, { count: number; resetAt: number }>();

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

export const chatRequestSchema = z.object({
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).max(120).optional(),
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
