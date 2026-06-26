import * as fs from "fs";
import * as path from "path";

export type RuntimeEventType =
  | "task_started"
  | "context_packed"
  | "project_instructions_loaded"
  | "approval_required"
  | "command_classified"
  | "patch_guarded"
  | "rollback_recorded"
  | "task_interrupted"
  | "task_completed";

export type RuntimeEvent = {
  type: RuntimeEventType;
  taskId: string;
  at: string;
  payload?: Record<string, unknown>;
};

export type RuntimeEmitter = (type: string, payload?: Record<string, unknown>) => void;

export type CommandKind = "validation" | "server" | "install" | "dangerous" | "git" | "read" | "unknown";

export type CommandClassification = {
  kind: CommandKind;
  finite: boolean;
  needsApproval: boolean;
  reason: string;
};

export type PatchLike = {
  path: string;
  operation: string;
  added?: number;
  removed?: number;
};

export type PatchGuardInput = {
  patches: PatchLike[];
  mode: "task" | "autofix";
  allowedFiles?: string[];
  staticProject?: boolean;
};

export type PatchGuardResult = {
  ok: boolean;
  rejectedFiles: string[];
  reasons: string[];
};

export type PackedContext = {
  instructions: string;
  files: Array<{ path: string; content: string }>;
  omitted: number;
  charCount: number;
};

export type HybridRuntimeOptions = {
  root: string;
  taskId: string;
  emit: RuntimeEmitter;
  safeMode: boolean;
  contextCharBudget?: number;
  stopFile?: string;
};

const SERVER_PATTERNS = [
  /^npm\s+start(?:\s|$)/i,
  /^npm\s+run\s+dev(?:\s|$)/i,
  /^pnpm\s+(?:start|dev|run\s+dev)(?:\s|$)/i,
  /^yarn\s+(?:start|dev)(?:\s|$)/i,
  /^bun\s+(?:start|dev|run\s+dev)(?:\s|$)/i,
  /\bnext\s+dev\b/i,
  /\bvite(?:\s|$).*--host\b/i,
  /\bphp\s+artisan\s+serve\b/i,
  /\bpython3?\s+-m\s+http\.server\b/i,
];

const VALIDATION_PATTERNS = [
  /^npm\s+run\s+build(?:\s|$)/i,
  /^npm\s+test(?:\s|$)/i,
  /^npm\s+run\s+lint(?:\s|$)/i,
  /^pnpm\s+(?:test|run\s+build|run\s+lint)(?:\s|$)/i,
  /^yarn\s+(?:test|build|lint)(?:\s|$)/i,
  /^bun\s+(?:test|run\s+build|run\s+lint)(?:\s|$)/i,
  /\btsc\s+--noEmit\b/i,
  /^node\s+-e\s+/i,
];

const INSTALL_PATTERNS = [
  /^npm\s+(?:i|install|add)(?:\s|$)/i,
  /^pnpm\s+(?:i|install|add)(?:\s|$)/i,
  /^yarn\s+(?:add|install)(?:\s|$)/i,
  /^bun\s+add(?:\s|$)/i,
];

const DANGEROUS_PATTERNS = [
  /\brm\s+-[rRfF]{2,}\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\b.*\bof=/i,
  /\bchmod\s+-R\s+777\b/i,
  /curl.*\|\s*(ba)?sh/i,
  /wget.*\|\s*(ba)?sh/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bdocker\s+.*\bprune\b/i,
  /\b(drop|truncate)\s+database\b/i,
];

const READ_PATTERNS = [/^cat\s+/i, /^ls(?:\s|$)/i, /^pwd$/i, /^git\s+status(?:\s|$)/i, /^git\s+diff(?:\s|$)/i];
const SECRET_PATH_RE = /(^|[\\/])\.env(\.|$)|secret|credential|private[-_]?key/i;

export class CodexStyleRuntimeAdapter {
  private readonly events: RuntimeEvent[] = [];
  private readonly budget: number;
  private readonly stopFile: string;

  constructor(private readonly options: HybridRuntimeOptions) {
    this.budget = options.contextCharBudget ?? 24000;
    this.stopFile = options.stopFile ?? path.join(options.root, ".meldex", "stop");
  }

  event(type: RuntimeEventType, payload: Record<string, unknown> = {}): RuntimeEvent {
    const event = { type, taskId: this.options.taskId, at: new Date().toISOString(), payload };
    this.events.push(event);
    this.options.emit("runtime_event", event);
    return event;
  }

  classifyCommand(command: string): CommandClassification {
    const normalized = command.trim();
    const lower = normalized.toLowerCase();
    if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { kind: "dangerous", finite: true, needsApproval: true, reason: "Dangerous command pattern." };
    }
    if (SERVER_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { kind: "server", finite: false, needsApproval: false, reason: "Long-running preview/server command." };
    }
    if (INSTALL_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { kind: "install", finite: true, needsApproval: this.options.safeMode, reason: "Dependency-changing command." };
    }
    if (VALIDATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { kind: "validation", finite: true, needsApproval: false, reason: "Finite validation command." };
    }
    if (lower.startsWith("git ")) {
      return { kind: "git", finite: true, needsApproval: /reset|checkout|merge|rebase|commit|push|pull/i.test(lower), reason: "Git command." };
    }
    if (READ_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { kind: "read", finite: true, needsApproval: false, reason: "Read-only command." };
    }
    return { kind: "unknown", finite: true, needsApproval: this.options.safeMode, reason: "Unclassified command." };
  }

  splitCommands(commands: string[]): { validation: string[]; server: string[]; approvalRequired: Array<{ command: string; reason: string }> } {
    const validation: string[] = [];
    const server: string[] = [];
    const approvalRequired: Array<{ command: string; reason: string }> = [];
    for (const command of commands) {
      const classified = this.classifyCommand(command);
      this.event("command_classified", { command, ...classified });
      if (classified.needsApproval) approvalRequired.push({ command, reason: classified.reason });
      if (classified.kind === "server") server.push(command);
      else validation.push(command);
    }
    if (approvalRequired.length) this.event("approval_required", { commands: approvalRequired });
    return { validation, server, approvalRequired };
  }

  loadProjectInstructions(): string {
    const candidates = [
      path.join(this.options.root, "AGENTS.md"),
      path.join(this.options.root, ".meldex", "AGENTS.md"),
      path.join(this.options.root, ".meldex", "instructions.md"),
    ];
    const blocks: string[] = [];
    for (const filePath of candidates) {
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > 120_000) continue;
        blocks.push(`### ${path.relative(this.options.root, filePath).replace(/\\/g, "/")}\n${fs.readFileSync(filePath, "utf8").slice(0, 8000)}`);
      } catch {
        // Project instruction files are optional.
      }
    }
    const instructions = blocks.join("\n\n");
    this.event("project_instructions_loaded", { files: blocks.length, chars: instructions.length });
    return instructions;
  }

  packContext(files: Array<{ path: string; content: string }>, extraInstructions = ""): PackedContext {
    const instructions = [this.loadProjectInstructions(), extraInstructions].filter(Boolean).join("\n\n").slice(0, 10000);
    let used = instructions.length;
    const packed: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      if (SECRET_PATH_RE.test(file.path)) continue;
      const remaining = this.budget - used - file.path.length - 32;
      if (remaining <= 400) break;
      const content = file.content.length > remaining ? `${file.content.slice(0, Math.max(0, remaining - 64))}\n\n/* context truncated */` : file.content;
      packed.push({ path: file.path, content });
      used += content.length + file.path.length + 32;
    }
    const result = { instructions, files: packed, omitted: Math.max(0, files.length - packed.length), charCount: used };
    this.event("context_packed", { files: packed.length, omitted: result.omitted, charCount: result.charCount });
    return result;
  }

  guardPatch(input: PatchGuardInput): PatchGuardResult {
    const root = path.resolve(this.options.root);
    const reasons: string[] = [];
    const rejected = new Set<string>();
    const allowed = input.allowedFiles?.length ? new Set(input.allowedFiles) : null;
    for (const patch of input.patches) {
      const full = path.resolve(this.options.root, patch.path);
      if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
        rejected.add(patch.path);
        reasons.push(`Path escapes workspace: ${patch.path}`);
      }
      if (SECRET_PATH_RE.test(patch.path)) {
        rejected.add(patch.path);
        reasons.push(`Secret-like path blocked: ${patch.path}`);
      }
      if (allowed && !allowed.has(patch.path)) {
        rejected.add(patch.path);
        reasons.push(`Patch outside allowed autofix scope: ${patch.path}`);
      }
      if (input.staticProject && ["package.json", "package-lock.json", "server.js"].includes(patch.path)) {
        rejected.add(patch.path);
        reasons.push(`Static project cannot add dependency/server file: ${patch.path}`);
      }
    }
    const ok = rejected.size === 0;
    this.event("patch_guarded", { ok, mode: input.mode, rejectedFiles: [...rejected], reasons });
    return { ok, rejectedFiles: [...rejected], reasons };
  }

  assertNotInterrupted(): void {
    if (fs.existsSync(this.stopFile)) {
      this.event("task_interrupted", { stopFile: this.stopFile });
      throw new Error(`Task interrupted by stop file: ${this.stopFile}`);
    }
  }

  complete(summary: string, payload: Record<string, unknown> = {}): void {
    this.event("task_completed", { summary, ...payload });
  }

  getEvents(): RuntimeEvent[] {
    return [...this.events];
  }
}
