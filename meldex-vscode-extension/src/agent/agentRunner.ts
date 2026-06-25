import * as vscode from "vscode";
import { MeldexApiClient, AgentResult, WorkspaceCtx } from "../api/client";
import { WorkspaceContext } from "../context/workspace";
import { DiffManager } from "../diff/diffManager";
import { isCommandAllowed, runProcess } from "../terminal/processRunner";

export type AgentStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

const MAX_RETRIES = 5;
const STEP_TIMEOUT_MS = 60000;

export class AgentRunner {
  constructor(
    private readonly client: MeldexApiClient,
    private readonly onStep: (steps: AgentStep[]) => void,
    private readonly onResult: (result: AgentResult, applied: string[]) => void,
    private readonly onError: (msg: string, retryable?: boolean) => void,
    private readonly onLog?: (line: string, stream: "stdout" | "stderr") => void
  ) {}

  async run(task: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const root = folders?.[0].uri.fsPath;

    const steps: AgentStep[] = [
      { id: "read",      label: "Reading workspace",  status: "running" },
      { id: "plan",      label: "Planning",            status: "pending" },
      { id: "edit",      label: "Editing files",       status: "pending" },
      { id: "run",       label: "Running command",     status: "pending" },
      { id: "fix",       label: "Fixing errors",       status: "pending" },
      { id: "done",      label: "Completed",           status: "pending" },
    ];
    this.onStep([...steps]);

    // ── Step 1: Gather workspace context ────────────────────────────────────
    const maxFiles = vscode.workspace.getConfiguration("meldex").get<number>("maxFilesToSend") ?? 20;
    let ctx: WorkspaceCtx = {};
    try {
      ctx = await this.withTimeout(WorkspaceContext.gather(maxFiles), STEP_TIMEOUT_MS, "Context gather");
      steps[0].status = "done";
      this.onStep([...steps]);
    } catch (e) {
      steps[0].status = "error";
      steps[0].detail = e instanceof Error ? e.message : String(e);
      this.onStep([...steps]);
      this.onError(`Context gather failed: ${steps[0].detail}`, true);
      return;
    }

    // ── Step 2: Plan → Edit → Run → Fix loop ───────────────────────────────
    let lastError: string | undefined;
    let applied: string[] = [];
    let finalResult: AgentResult | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Planning
      steps[1].status = "running";
      steps[1].detail = attempt > 0 ? `Retry ${attempt}/${MAX_RETRIES - 1}` : undefined;
      this.onStep([...steps]);

      let result: AgentResult;
      try {
        const agentCtx: WorkspaceCtx = lastError
          ? { ...ctx, terminalError: lastError }
          : ctx;
        result = await this.withTimeout(
          this.client.runAgent(task, agentCtx),
          STEP_TIMEOUT_MS,
          "Agent plan"
        );
        if (result.error) throw new Error(result.error);
      } catch (e) {
        steps[1].status = "error";
        steps[1].detail = e instanceof Error ? e.message : "Agent failed";
        this.onStep([...steps]);
        this.onError(steps[1].detail!, true);
        return;
      }

      steps[1].status = "done";
      finalResult = result;

      // ── Step 3: Edit files ───────────────────────────────────────────────
      if (result.files?.length && root) {
        steps[2].status = "running";
        steps[2].detail = `${result.files.length} file(s)`;
        this.onStep([...steps]);

        const autoApply = vscode.workspace.getConfiguration("meldex").get<boolean>("autoApplyChanges") ?? false;

        if (autoApply) {
          const { applied: a, errors } = await WorkspaceContext.applyFileChanges(root, result.files);
          applied = a;
          if (errors.length) vscode.window.showWarningMessage(`Some files failed: ${errors.join(", ")}`);
          steps[2].status = "done";
          this.onStep([...steps]);
        } else {
          // Show diff for review
          let diffAccepted = false;
          const diffMgr = new DiffManager(root);
          await diffMgr.showChanges(result.files, async (accepted) => {
            if (accepted && root) {
              const { applied: a, errors } = await WorkspaceContext.applyFileChanges(root, result.files!);
              applied = a;
              if (errors.length) vscode.window.showWarningMessage(`Some files failed: ${errors.join(", ")}`);
              diffAccepted = true;
            }
          });
          steps[2].status = diffAccepted ? "done" : "error";
          this.onStep([...steps]);
          if (!diffAccepted) {
            this.onError("File changes rejected by user.", false);
            return;
          }
        }
      } else {
        steps[2].status = "done";
        this.onStep([...steps]);
      }

      // ── Step 4: Run commands ─────────────────────────────────────────────
      if (result.commands?.length && root) {
        steps[3].status = "running";
        this.onStep([...steps]);

        let cmdError: string | undefined;
        for (const cmd of result.commands) {
          if (!isCommandAllowed(cmd)) {
            const choice = await vscode.window.showWarningMessage(
              `Meldex: Blocked command: "${cmd}"\nAllow this?`,
              "Allow", "Skip"
            );
            if (choice !== "Allow") {
              this.onLog?.(`[BLOCKED] ${cmd}`, "stderr");
              continue;
            }
          }

          steps[3].detail = cmd.slice(0, 50);
          this.onStep([...steps]);
          this.onLog?.(`$ ${cmd}`, "stdout");

          const res = await runProcess(cmd, root, (line, stream) => {
            this.onLog?.(line, stream);
          }, STEP_TIMEOUT_MS);

          if (res.timedOut) {
            cmdError = `Command timed out after 60s: ${cmd}`;
            break;
          }
          if (res.exitCode !== 0) {
            cmdError = res.stderr || res.stdout || `Command failed (exit ${res.exitCode}): ${cmd}`;
            break;
          }
        }

        if (cmdError) {
          steps[3].status = "error";
          steps[3].detail = cmdError.slice(0, 80);
          this.onStep([...steps]);

          if (attempt < MAX_RETRIES - 1) {
            // Feed error back to AI for fix on next iteration
            lastError = cmdError;
            steps[4].status = "running";
            steps[4].detail = `Error: ${cmdError.slice(0, 60)}`;
            this.onStep([...steps]);
            await new Promise(r => setTimeout(r, 800));
            steps[4].status = "done";
            // Reset for next attempt
            steps[1].status = "pending";
            steps[2].status = "pending";
            steps[3].status = "pending";
            steps[4].status = "pending";
            this.onStep([...steps]);
            continue; // retry loop
          } else {
            this.onError(`Max retries reached. Last error: ${cmdError}`, true);
            steps[5].status = "error";
            this.onStep([...steps]);
            this.onResult(result, applied);
            return;
          }
        }

        steps[3].status = "done";
        this.onStep([...steps]);
      } else {
        steps[3].status = "done";
        steps[4].status = "done";
        this.onStep([...steps]);
      }

      // Success — exit loop
      lastError = undefined;
      break;
    }

    steps[4].status = lastError ? "error" : "done";
    steps[5].status = "done";
    this.onStep([...steps]);
    if (finalResult) {
      this.onResult(finalResult, applied);
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }
}
