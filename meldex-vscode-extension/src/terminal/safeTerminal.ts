import * as vscode from "vscode";

const BLOCKED_PATTERNS = [
  /\brm\s+-[rRfF]{2,}\b/i, /\bsudo\b/i, /\bshutdown\b/i, /\breboot\b/i,
  /\bmkfs\b/i, /\bdd\b.*\bof=/i, /\bchmod\s+-R\s+777\b/i, /\bformat\b/i,
  /\bdrop\s+database\b/i, /\btruncate\b/i, /\b>\s*\/dev\/(s?d|null)\b/i,
  /curl.*\|\s*(ba)?sh/i, /wget.*\|\s*(ba)?sh/i,
];

const ALLOWED_PREFIXES = [
  "npm ", "npx ", "pnpm ", "yarn ", "node ", "tsc ", "next ",
  "php artisan ", "composer ", "python ", "pip ", "poetry ",
  "cargo ", "go ", "git ", "cat ", "ls ", "echo ", "mkdir ",
  "cp ", "mv ",
];

export class SafeTerminal {
  private terminal: vscode.Terminal | null = null;

  constructor(private readonly safe: boolean) {}

  isAllowed(command: string): boolean {
    if (!this.safe) return true;
    const normalized = command.trim().toLowerCase();
    if (BLOCKED_PATTERNS.some(p => p.test(normalized))) return false;
    return ALLOWED_PREFIXES.some(p => normalized.startsWith(p));
  }

  async run(command: string): Promise<void> {
    if (!this.isAllowed(command)) {
      const choice = await vscode.window.showWarningMessage(
        `Meldex: Blocked command: "${command}"\nAllow this?`,
        "Allow", "Skip"
      );
      if (choice !== "Allow") return;
    }

    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({
        name: "Meldex AI",
        iconPath: new vscode.ThemeIcon("robot"),
      });
    }
    this.terminal.show(true);
    this.terminal.sendText(command);

    // Wait for command to likely complete (heuristic)
    await new Promise(r => setTimeout(r, 2000));
  }

  dispose(): void {
    this.terminal?.dispose();
    this.terminal = null;
  }
}
