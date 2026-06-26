import * as fs from "fs";
import * as path from "path";

export interface WorkspaceMemory {
  projectSummary: string;
  architectureSummary: string;
  conversationMemory: Array<{ prompt: string; outcome: string; at: string }>;
  workspaceFacts: string[];
  taskMemory: Array<{ prompt: string; summary: string; files: string[]; validation: string; qualityScore: number; at: string }>;
  errorMemory: Array<{ error: string; rootCause: string; fix: string; retryCount: number; at: string }>;
  preferenceMemory: string[];
  decisions: string[];
  activePreviewCommand: string;
  recentEdits: string[];
  knownIssues: string[];
  successfulFixes: string[];
  codingStyle: string[];
  frequentCommands: string[];
  commonErrors: string[];
  predictions: string[];
  styleProfile: string[];
  selfImprovement: string[];
  updatedAt: string;
}

const DEFAULT_MEMORY: WorkspaceMemory = {
  projectSummary: "",
  architectureSummary: "",
  conversationMemory: [],
  workspaceFacts: [],
  taskMemory: [],
  errorMemory: [],
  preferenceMemory: [],
  decisions: [],
  activePreviewCommand: "",
  recentEdits: [],
  knownIssues: [],
  successfulFixes: [],
  codingStyle: [],
  frequentCommands: [],
  commonErrors: [],
  predictions: [],
  styleProfile: [],
  selfImprovement: [],
  updatedAt: new Date(0).toISOString(),
};

export function readWorkspaceMemory(storageRoot: string): WorkspaceMemory {
  try {
    const file = memoryPath(storageRoot);
    if (!fs.existsSync(file)) return { ...DEFAULT_MEMORY };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<WorkspaceMemory>;
    return {
      ...DEFAULT_MEMORY,
      ...parsed,
      conversationMemory: safeObjectList(parsed.conversationMemory, 40),
      workspaceFacts: safeList(parsed.workspaceFacts),
      taskMemory: safeObjectList(parsed.taskMemory, 80),
      errorMemory: safeObjectList(parsed.errorMemory, 80),
      preferenceMemory: safeList(parsed.preferenceMemory),
      decisions: safeList(parsed.decisions),
      activePreviewCommand: sanitizeText(parsed.activePreviewCommand || ""),
      recentEdits: safeList(parsed.recentEdits),
      knownIssues: safeList(parsed.knownIssues),
      successfulFixes: safeList(parsed.successfulFixes),
      codingStyle: safeList(parsed.codingStyle),
      frequentCommands: safeList(parsed.frequentCommands),
      commonErrors: safeList(parsed.commonErrors),
      predictions: safeList(parsed.predictions),
      styleProfile: safeList(parsed.styleProfile),
      selfImprovement: safeList(parsed.selfImprovement),
    };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

export function learnFromTask(
  storageRoot: string,
  update: {
    projectSummary?: string;
    architectureSummary?: string;
    edits?: string[];
    fixes?: string[];
    commands?: string[];
    issues?: string[];
    errors?: string[];
    style?: string[];
    predictions?: string[];
    selfImprovement?: string[];
    prompt?: string;
    summary?: string;
    files?: string[];
    validation?: string;
    qualityScore?: number;
    retryCount?: number;
    decisions?: string[];
    preferences?: string[];
    activePreviewCommand?: string;
  }
): WorkspaceMemory {
  const previous = readWorkspaceMemory(storageRoot);
  const now = new Date().toISOString();
  const next: WorkspaceMemory = {
    projectSummary: update.projectSummary || previous.projectSummary,
    architectureSummary: update.architectureSummary || previous.architectureSummary,
    conversationMemory: mergeObjects(
      update.prompt ? [{ prompt: update.prompt, outcome: update.summary || update.projectSummary || "Task completed", at: now }] : undefined,
      previous.conversationMemory,
      40
    ),
    workspaceFacts: mergeLimited([
      update.projectSummary,
      update.architectureSummary,
      ...(update.files || []).map((file) => `File changed: ${file}`),
    ].filter((item): item is string => Boolean(item)), previous.workspaceFacts, 80),
    taskMemory: mergeObjects(
      update.prompt ? [{
        prompt: update.prompt,
        summary: update.summary || "",
        files: update.files || [],
        validation: update.validation || "",
        qualityScore: update.qualityScore || 0,
        at: now,
      }] : undefined,
      previous.taskMemory,
      80
    ),
    errorMemory: mergeObjects(
      update.errors?.length ? update.errors.map((error) => ({
        error,
        rootCause: update.issues?.[0] || "",
        fix: update.fixes?.[0] || "",
        retryCount: update.retryCount || 0,
        at: now,
      })) : undefined,
      previous.errorMemory,
      80
    ),
    preferenceMemory: mergeLimited(update.preferences, previous.preferenceMemory, 50),
    decisions: mergeLimited(update.decisions, previous.decisions, 80),
    activePreviewCommand: update.activePreviewCommand || previous.activePreviewCommand,
    recentEdits: mergeLimited(update.edits, previous.recentEdits, 80),
    knownIssues: mergeLimited(update.issues, previous.knownIssues, 50),
    successfulFixes: mergeLimited(update.fixes, previous.successfulFixes, 50),
    codingStyle: mergeLimited(update.style, previous.codingStyle, 30),
    frequentCommands: mergeLimited(update.commands, previous.frequentCommands, 30),
    commonErrors: mergeLimited(update.errors, previous.commonErrors, 40),
    predictions: mergeLimited(update.predictions, previous.predictions, 40),
    styleProfile: mergeLimited(update.style, previous.styleProfile, 40),
    selfImprovement: mergeLimited(update.selfImprovement, previous.selfImprovement, 40),
    updatedAt: now,
  };
  fs.mkdirSync(storageRoot, { recursive: true });
  fs.writeFileSync(memoryPath(storageRoot), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function memoryPath(storageRoot: string): string {
  return path.join(storageRoot, "workspace-memory.json");
}

function safeList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(sanitizeText).filter(Boolean).slice(0, 120) : [];
}

function mergeLimited(incoming: string[] | undefined, existing: string[], limit: number): string[] {
  return [...new Set([...(incoming || []).map(sanitizeText).filter(Boolean), ...existing])].slice(0, limit);
}

function safeObjectList<T>(value: unknown, limit: number): T[] {
  return Array.isArray(value) ? JSON.parse(sanitizeText(JSON.stringify(value.slice(0, limit)))) as T[] : [];
}

function mergeObjects<T>(incoming: T[] | undefined, existing: T[], limit: number): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of [...(incoming || []), ...existing]) {
    const key = sanitizeText(JSON.stringify(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(JSON.parse(key) as T);
    if (result.length >= limit) break;
  }
  return result;
}

function sanitizeText(value: unknown) {
  return String(value ?? "")
    .replace(/mdx_[A-Za-z0-9_-]+/g, "mdx_****")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-****")
    .replace(/(password|token|api[_-]?key|secret)=([^\s&"']+)/gi, "$1=****")
    .replace(/```[\s\S]*?```/g, "[code omitted]")
    .slice(0, 4000)
    .trim();
}

export function retrieveRelevantMemory(memory: WorkspaceMemory, task: string) {
  const terms = task.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const score = (text: string) => terms.reduce((total, term) => total + (text.toLowerCase().includes(term) ? 1 : 0), 0);
  const continuity = /\b(continue|previous|same|again|restore|yesterday|last|better|fix)\b/i.test(task) ? 4 : 0;
  const rankedTasks = memory.taskMemory
    .map((item) => ({ item, score: score(`${item.prompt} ${item.summary} ${item.files.join(" ")}`) + continuity }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ item }) => item);
  const rankedErrors = memory.errorMemory
    .map((item) => ({ item, score: score(`${item.error} ${item.rootCause} ${item.fix}`) + (/\bfix|error|same issue\b/i.test(task) ? 3 : 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ item }) => item);
  const lines = [
    memory.projectSummary ? `Project summary: ${memory.projectSummary}` : "",
    memory.architectureSummary ? `Architecture: ${memory.architectureSummary}` : "",
    memory.preferenceMemory.length ? `Preferences: ${memory.preferenceMemory.slice(0, 8).join("; ")}` : "",
    memory.decisions.length ? `Decisions: ${memory.decisions.slice(0, 8).join("; ")}` : "",
    memory.codingStyle.length ? `Coding style: ${memory.codingStyle.slice(0, 8).join("; ")}` : "",
    memory.styleProfile.length ? `Design style: ${memory.styleProfile.slice(0, 8).join("; ")}` : "",
    rankedTasks.length ? `Relevant tasks: ${rankedTasks.map((item) => `${item.prompt} => ${item.summary}`).join(" | ")}` : "",
    rankedErrors.length ? `Related errors/fixes: ${rankedErrors.map((item) => `${item.error} => ${item.fix || item.rootCause}`).join(" | ")}` : "",
    memory.activePreviewCommand ? `Active preview command: ${memory.activePreviewCommand}` : "",
  ].filter(Boolean);
  return {
    snippet: lines.length ? `[Relevant Meldex Memory]\n${lines.join("\n").slice(0, 3200)}` : "",
    relatedTasks: rankedTasks.length,
    relatedErrors: rankedErrors.length,
    reusedStyle: memory.styleProfile.length > 0 || memory.codingStyle.length > 0,
  };
}
