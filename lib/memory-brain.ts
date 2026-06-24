/**
 * lib/memory-brain.ts
 *
 * Persistent user memory — stores preferences, language, recent context.
 * Backed by PostgreSQL (UserMemory table).
 *
 * Well-known keys (use MEMORY_KEY constants below):
 *   language_preference   — "Gujarati" | "Hindi" | "English"
 *   recent_topics         — JSON string array
 *   recent_projects       — JSON string array
 *   recent_tasks          — JSON string array
 *   user_name             — Display name preference
 *   coding_style          — Code formatting / style preferences
 *   tone_preference       — "formal" | "casual"
 */

import { prisma } from "./prisma";

// ── Well-known memory keys ────────────────────────────────────────────────────

export const MEMORY_KEY = {
  LANGUAGE: "language_preference",
  RECENT_TOPICS: "recent_topics",
  RECENT_PROJECTS: "recent_projects",
  RECENT_TASKS: "recent_tasks",
  USER_NAME: "user_name",
  CODING_STYLE: "coding_style",
  TONE: "tone_preference",
  LAST_SEEN: "last_seen",
} as const;

// ── In-process LRU cache (per userId, TTL 5 min) ─────────────────────────────

interface MemCacheEntry { data: Record<string, string>; expires: number }
const MEM_CACHE = new Map<string, MemCacheEntry>();
const MEM_TTL = 5 * 60 * 1000;

function cacheGet(userId: string): Record<string, string> | null {
  const e = MEM_CACHE.get(userId);
  if (e && e.expires > Date.now()) return e.data;
  MEM_CACHE.delete(userId);
  return null;
}
function cacheSet(userId: string, data: Record<string, string>) {
  MEM_CACHE.set(userId, { data, expires: Date.now() + MEM_TTL });
}
function cacheInvalidate(userId: string) {
  MEM_CACHE.delete(userId);
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────

/** Get a single memory value for a user, or null. */
export async function memGet(userId: string, key: string): Promise<string | null> {
  const cached = cacheGet(userId);
  if (cached) return cached[key] ?? null;

  // Load all keys for this user at once (cheaper than per-key queries)
  const rows = await prisma.userMemory.findMany({ where: { userId } });
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));
  cacheSet(userId, map);
  return map[key] ?? null;
}

/** Get ALL memory entries for a user as a plain object. */
export async function memGetAll(userId: string): Promise<Record<string, string>> {
  const cached = cacheGet(userId);
  if (cached) return { ...cached };

  const rows = await prisma.userMemory.findMany({ where: { userId } });
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));
  cacheSet(userId, map);
  return map;
}

/** Set (upsert) a memory value. */
export async function memSet(userId: string, key: string, value: string): Promise<void> {
  await prisma.userMemory.upsert({
    where: { userId_key: { userId, key } },
    update: { value },
    create: { userId, key, value },
  });
  cacheInvalidate(userId);
}

/** Delete a memory key. */
export async function memDelete(userId: string, key: string): Promise<void> {
  await prisma.userMemory.deleteMany({ where: { userId, key } });
  cacheInvalidate(userId);
}

// ── JSON array helpers ────────────────────────────────────────────────────────

/** Push an item to a JSON-string array memory key (max length capped). */
export async function memPush(
  userId: string,
  key: string,
  item: string,
  maxLen = 10
): Promise<void> {
  const existing = await memGet(userId, key);
  let arr: string[] = [];
  try { arr = existing ? JSON.parse(existing) : []; } catch { arr = []; }
  arr = [item, ...arr.filter((x) => x !== item)].slice(0, maxLen);
  await memSet(userId, key, JSON.stringify(arr));
}

/** Get a JSON-string array memory key. */
export async function memGetArray(userId: string, key: string): Promise<string[]> {
  const raw = await memGet(userId, key);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Language detection + memory ───────────────────────────────────────────────

function detectLang(text: string): string | null {
  if (/[\u0A80-\u0AFF]/.test(text)) return "Gujarati";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/\b(kon che|kem cho|shu |chhe|tamne|mane|atyare|haal)\b/i.test(text)) return "Gujarati";
  if (/\b(kya |kaun |hai |hain|aaj |abhi)\b/i.test(text)) return "Hindi";
  return null;
}

/**
 * Auto-update language preference from a message.
 * Only updates if detected language differs from stored preference.
 */
export async function autoUpdateLanguage(userId: string, message: string): Promise<void> {
  const detected = detectLang(message);
  if (!detected) return;
  const stored = await memGet(userId, MEMORY_KEY.LANGUAGE);
  if (stored !== detected) {
    await memSet(userId, MEMORY_KEY.LANGUAGE, detected);
  }
}

// ── Memory-injected system prompt ─────────────────────────────────────────────

/**
 * Build a memory context snippet to prepend to system prompts.
 * Only includes non-empty preferences.
 */
export async function buildMemoryContext(userId: string): Promise<string> {
  const mem = await memGetAll(userId);
  const lines: string[] = [];

  if (mem[MEMORY_KEY.LANGUAGE]) {
    lines.push(`User's preferred language: ${mem[MEMORY_KEY.LANGUAGE]}`);
  }
  if (mem[MEMORY_KEY.USER_NAME]) {
    lines.push(`User's name: ${mem[MEMORY_KEY.USER_NAME]}`);
  }
  if (mem[MEMORY_KEY.TONE]) {
    lines.push(`Preferred tone: ${mem[MEMORY_KEY.TONE]}`);
  }
  if (mem[MEMORY_KEY.CODING_STYLE]) {
    lines.push(`Coding style: ${mem[MEMORY_KEY.CODING_STYLE]}`);
  }

  try {
    const recentTopics = mem[MEMORY_KEY.RECENT_TOPICS]
      ? (JSON.parse(mem[MEMORY_KEY.RECENT_TOPICS]) as string[]).slice(0, 3)
      : [];
    if (recentTopics.length) {
      lines.push(`Recent topics: ${recentTopics.join(", ")}`);
    }
  } catch { /* ignore */ }

  try {
    const recentProjects = mem[MEMORY_KEY.RECENT_PROJECTS]
      ? (JSON.parse(mem[MEMORY_KEY.RECENT_PROJECTS]) as string[]).slice(0, 3)
      : [];
    if (recentProjects.length) {
      lines.push(`Recent projects: ${recentProjects.join(", ")}`);
    }
  } catch { /* ignore */ }

  if (!lines.length) return "";
  return `[User Memory]\n${lines.join("\n")}\n`;
}

// ── Memory query handler ───────────────────────────────────────────────────────

const MEMORY_QUERY_PATTERNS = [
  /my (preferred |favorite )?(language|bhasha)/i,
  /what language (do i|i prefer)/i,
  /remember.*my/i,
  /what.*you.*know.*about me/i,
  /my (name|preference|style|tone)/i,
  /meldex.*remember/i,
];

export function isMemoryQuery(message: string): boolean {
  return MEMORY_QUERY_PATTERNS.some((p) => p.test(message));
}

export async function answerMemoryQuery(userId: string, question: string): Promise<string> {
  const mem = await memGetAll(userId);

  if (/language|bhasha/i.test(question)) {
    return mem[MEMORY_KEY.LANGUAGE]
      ? `Your preferred language is **${mem[MEMORY_KEY.LANGUAGE]}**. I'll always respond in ${mem[MEMORY_KEY.LANGUAGE]}.`
      : "I haven't detected a language preference yet. Just chat with me in your preferred language and I'll remember it automatically.";
  }
  if (/name/i.test(question)) {
    return mem[MEMORY_KEY.USER_NAME]
      ? `I know you as **${mem[MEMORY_KEY.USER_NAME]}**.`
      : "I don't have your name stored yet. You can tell me: \"My name is [name]\".";
  }

  // General memory dump
  if (!Object.keys(mem).length) {
    return "I don't have any stored preferences for you yet. As we chat, I'll learn your language, style, and recent projects automatically.";
  }

  const parts: string[] = ["Here's what I remember about you:"];
  if (mem[MEMORY_KEY.LANGUAGE]) parts.push(`- Language: ${mem[MEMORY_KEY.LANGUAGE]}`);
  if (mem[MEMORY_KEY.USER_NAME]) parts.push(`- Name: ${mem[MEMORY_KEY.USER_NAME]}`);
  if (mem[MEMORY_KEY.TONE]) parts.push(`- Tone preference: ${mem[MEMORY_KEY.TONE]}`);
  if (mem[MEMORY_KEY.CODING_STYLE]) parts.push(`- Coding style: ${mem[MEMORY_KEY.CODING_STYLE]}`);
  try {
    const topics = JSON.parse(mem[MEMORY_KEY.RECENT_TOPICS] ?? "[]") as string[];
    if (topics.length) parts.push(`- Recent topics: ${topics.slice(0, 5).join(", ")}`);
  } catch { /* ignore */ }
  try {
    const projects = JSON.parse(mem[MEMORY_KEY.RECENT_PROJECTS] ?? "[]") as string[];
    if (projects.length) parts.push(`- Recent projects: ${projects.slice(0, 3).join(", ")}`);
  } catch { /* ignore */ }

  return parts.join("\n");
}

// ── Auto-learn from messages ───────────────────────────────────────────────────

/**
 * Extract and persist preferences from a natural language message.
 * Called automatically in the chat route.
 */
export async function learnFromMessage(userId: string, message: string): Promise<void> {
  // Language auto-detection
  await autoUpdateLanguage(userId, message);

  // "My name is X"
  const nameMatch = message.match(/my name is ([A-Za-z ]{2,30})/i);
  if (nameMatch) {
    await memSet(userId, MEMORY_KEY.USER_NAME, nameMatch[1].trim());
  }

  // "I prefer formal/casual"
  if (/prefer.*formal|formal.*tone/i.test(message)) {
    await memSet(userId, MEMORY_KEY.TONE, "formal");
  } else if (/prefer.*casual|casual.*tone/i.test(message)) {
    await memSet(userId, MEMORY_KEY.TONE, "casual");
  }

  // Update last seen
  await memSet(userId, MEMORY_KEY.LAST_SEEN, new Date().toISOString());
}
