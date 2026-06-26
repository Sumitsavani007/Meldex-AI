import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export type ProcessHealth = {
  ok: boolean;
  node?: string;
  cli?: string;
  backend?: "ok" | "unknown" | "error";
  workspace?: "ok" | "missing";
  storage?: "ok" | "error";
  reason?: string;
};

export type ManagedProcess = {
  child: cp.ChildProcess;
  nodePath: string;
  cliPath: string;
};

type LaunchOptions = {
  extensionRoot: string;
  workspaceRoot: string;
  storageRoot?: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  onStdout: (chunk: Buffer) => void;
  onStderr: (chunk: Buffer) => void;
  onError: (message: string) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
};

const CODE_HELPER_RE = /code helper|electron|apptranslocation/i;

export class ProcessManager {
  private child: cp.ChildProcess | null = null;
  private heartbeat: NodeJS.Timeout | undefined;
  private restartCount = 0;
  private lastLaunch: LaunchOptions | null = null;

  async preflight(extensionRoot: string, workspaceRoot?: string, storageRoot?: string): Promise<ProcessHealth> {
    const node = this.resolveNodeRuntime();
    if (!node) return { ok: false, workspace: workspaceRoot ? "ok" : "missing", reason: "Node runtime not found." };
    const cli = this.resolveCli(extensionRoot);
    if (!cli) return { ok: false, node, workspace: workspaceRoot ? "ok" : "missing", reason: "Meldex Agent CLI not found." };
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return { ok: false, node, cli, workspace: "missing", reason: "Workspace folder not found." };
    try {
      if (storageRoot) fs.mkdirSync(storageRoot, { recursive: true });
    } catch (error) {
      return { ok: false, node, cli, workspace: "ok", storage: "error", reason: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true, node, cli, workspace: "ok", storage: "ok", backend: "unknown" };
  }

  async launchCli(options: LaunchOptions): Promise<ManagedProcess> {
    const health = await this.preflight(options.extensionRoot, options.workspaceRoot, options.storageRoot);
    if (!health.ok || !health.node || !health.cli) {
      throw new Error(this.userFriendlyStartError(health.reason));
    }

    this.lastLaunch = options;
    const child = cp.spawn(health.node, [health.cli, ...options.args], {
      cwd: options.workspaceRoot,
      shell: false,
      env: { ...process.env, ...options.env },
    });
    this.child = child;

    child.stdout?.on("data", options.onStdout);
    child.stderr?.on("data", options.onStderr);
    child.on("error", (error) => {
      options.onError(this.userFriendlyStartError(error.message));
    });
    child.on("close", (code, signal) => {
      this.child = null;
      options.onExit(code, signal);
    });
    this.startHeartbeat(options);
    return { child, nodePath: health.node, cliPath: health.cli };
  }

  kill(): void {
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      setTimeout(() => {
        if (this.child && !this.child.killed) this.child.kill("SIGKILL");
      }, 1500);
    }
    this.child = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  repairBundledCli(extensionRoot: string): { ok: boolean; path?: string; reason?: string } {
    const binDir = path.join(extensionRoot, "meldex-agent-cli", "bin");
    const cliPath = path.join(binDir, "meldex-agent.js");
    const mainPath = path.join(extensionRoot, "out", "cli", "main.js");
    try {
      if (!fs.existsSync(mainPath)) return { ok: false, reason: "Compiled CLI main.js missing." };
      fs.mkdirSync(binDir, { recursive: true });
      if (!fs.existsSync(cliPath)) {
        fs.writeFileSync(cliPath, "#!/usr/bin/env node\nrequire(\"../../out/cli/main.js\");\n", "utf8");
        fs.chmodSync(cliPath, 0o755);
      }
      return { ok: true, path: cliPath };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private startHeartbeat(options: LaunchOptions): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(async () => {
      const health = await this.preflight(options.extensionRoot, options.workspaceRoot, options.storageRoot);
      if (!health.ok) options.onError(this.userFriendlyStartError(health.reason));
      if (!this.child && this.lastLaunch && this.restartCount < 3) {
        this.restartCount += 1;
        try {
          await this.launchCli(this.lastLaunch);
        } catch (error) {
          options.onError(error instanceof Error ? error.message : String(error));
        }
      }
    }, 10_000);
  }

  private resolveNodeRuntime(): string | undefined {
    const execPath = process.execPath;
    if (execPath && !CODE_HELPER_RE.test(execPath) && fs.existsSync(execPath)) return execPath;

    const configured = vscode.workspace.getConfiguration("meldex").get<string>("nodePath")?.trim();
    if (configured && fs.existsSync(configured) && !CODE_HELPER_RE.test(configured)) return configured;

    const pathNode = this.findOnPath(process.platform === "win32" ? "node.exe" : "node");
    if (pathNode && !CODE_HELPER_RE.test(pathNode)) return pathNode;
    return undefined;
  }

  private resolveCli(extensionRoot: string): string | undefined {
    const bundled = path.join(extensionRoot, "meldex-agent-cli", "bin", "meldex-agent.js");
    if (fs.existsSync(bundled)) return bundled;

    const installed = this.findOnPath(process.platform === "win32" ? "meldex-agent.cmd" : "meldex-agent");
    if (installed && installed.endsWith(".js") && fs.existsSync(installed)) return installed;

    const configured = vscode.workspace.getConfiguration("meldex").get<string>("cliPath")?.trim();
    if (configured && fs.existsSync(configured)) return configured;
    return undefined;
  }

  private findOnPath(binary: string): string | undefined {
    const delimiter = process.platform === "win32" ? ";" : ":";
    for (const dir of (process.env.PATH || "").split(delimiter)) {
      if (!dir) continue;
      const full = path.join(dir, binary);
      if (fs.existsSync(full)) return full;
    }
    return undefined;
  }

  private userFriendlyStartError(reason?: string): string {
    const clean = reason || "Unknown launch failure.";
    if (/node runtime/i.test(clean)) return "Meldex Agent failed to start.\nReason: Node runtime not found.";
    if (/cli/i.test(clean)) return "Meldex Agent failed to start.\nReason: Meldex Agent CLI not found.";
    if (/EACCES|permission/i.test(clean)) return "Meldex Agent failed to start.\nReason: Permission denied.";
    if (/ENOENT/i.test(clean)) return "Meldex Agent failed to start.\nReason: Required runtime or CLI file is missing.";
    return `Meldex Agent failed to start.\nReason: ${clean}`;
  }
}
