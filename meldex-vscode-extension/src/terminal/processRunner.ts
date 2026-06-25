import * as cp from "child_process";
import * as path from "path";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export type LogCallback = (line: string, stream: "stdout" | "stderr") => void;

const BLOCKED_PATTERNS = [
  /\brm\s+-[rRfF]{2,}\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\b\bdd\b.*\bof=/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bformat\b/i,
  /\bdrop\s+database\b/i,
  /\btruncate\b/i,
  /curl.*\|\s*(ba)?sh/i,
  /wget.*\|\s*(ba)?sh/i,
  /\b>\s*\/dev\/(s?d|null)\b/i,
];

const ALLOWED_PREFIXES = [
  "npm ",   "npx ",   "pnpm ",  "yarn ",  "node ",
  "tsc ",   "next ",  "vite ",  "vitest ",
  "php artisan ", "composer ",
  "python ", "python3 ", "pip ", "pip3 ", "poetry ",
  "cargo ",  "go ",
  "git ",    "cat ",   "ls ",   "echo ",
  "mkdir ",  "cp ",    "mv ",   "touch ",
  "jest ",   "mocha ", "eslint ", "prettier ",
];

export function isCommandAllowed(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (BLOCKED_PATTERNS.some((p) => p.test(normalized))) return false;
  return ALLOWED_PREFIXES.some((p) => normalized.startsWith(p));
}

export function runProcess(
  command: string,
  cwd: string,
  onLog: LogCallback,
  timeoutMs = 60000
): Promise<RunResult> {
  return new Promise((resolve) => {
    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    if (!parts.length) {
      resolve({ stdout: "", stderr: "Empty command", exitCode: 1, timedOut: false });
      return;
    }

    const [bin, ...args] = parts;
    if (!bin) {
      resolve({ stdout: "", stderr: "Empty command", exitCode: 1, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    let child: cp.ChildProcess;
    try {
      child = cp.spawn(bin, args, {
        cwd,
        shell: true,
        env: { ...process.env },
      });
    } catch (err) {
      resolve({
        stdout: "",
        stderr: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: 1,
        timedOut: false,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      stdout += line;
      line.split("\n").filter(Boolean).forEach((l) => onLog(l, "stdout"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      stderr += line;
      line.split("\n").filter(Boolean).forEach((l) => onLog(l, "stderr"));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, exitCode: 1, timedOut });
    });
  });
}
