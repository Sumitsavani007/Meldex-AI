import * as fs from "fs";
import * as path from "path";

export interface WorkspaceMemory {
  projectSummary: string;
  architectureSummary: string;
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
  }
): WorkspaceMemory {
  const previous = readWorkspaceMemory(storageRoot);
  const next: WorkspaceMemory = {
    projectSummary: update.projectSummary || previous.projectSummary,
    architectureSummary: update.architectureSummary || previous.architectureSummary,
    recentEdits: mergeLimited(update.edits, previous.recentEdits, 80),
    knownIssues: mergeLimited(update.issues, previous.knownIssues, 50),
    successfulFixes: mergeLimited(update.fixes, previous.successfulFixes, 50),
    codingStyle: mergeLimited(update.style, previous.codingStyle, 30),
    frequentCommands: mergeLimited(update.commands, previous.frequentCommands, 30),
    commonErrors: mergeLimited(update.errors, previous.commonErrors, 40),
    predictions: mergeLimited(update.predictions, previous.predictions, 40),
    styleProfile: mergeLimited(update.style, previous.styleProfile, 40),
    selfImprovement: mergeLimited(update.selfImprovement, previous.selfImprovement, 40),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(storageRoot, { recursive: true });
  fs.writeFileSync(memoryPath(storageRoot), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function memoryPath(storageRoot: string): string {
  return path.join(storageRoot, "workspace-memory.json");
}

function safeList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 120) : [];
}

function mergeLimited(incoming: string[] | undefined, existing: string[], limit: number): string[] {
  return [...new Set([...(incoming || []).filter(Boolean), ...existing])].slice(0, limit);
}
