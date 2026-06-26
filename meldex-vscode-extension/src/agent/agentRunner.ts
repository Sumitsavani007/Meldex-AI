import * as vscode from "vscode";
import * as path from "path";
import { MeldexApiClient, AgentResult, WorkspaceCtx } from "../api/client";
import { DiffManager } from "../diff/diffManager";
import { isCommandAllowed, runProcess, RunResult } from "../terminal/processRunner";
import { detectValidationCommands, requestNeedsExecution, requestNeedsServer, ServerRunner, ServerStatus } from "../terminal/serverRunner";
import { autonomousPromptSection, buildAutonomousPlan, planNeedsUserInput, safeReasoningSummary } from "./autonomousOrchestrator";
import { ContextBuilder } from "./contextBuilder";
import { EventNormalizer } from "./eventNormalizer";
import { errorFingerprint, parseAgentError } from "./errorParser";
import { buildFixTask } from "./fixGenerator";
import { PatchSummary } from "./patchEngine";
import { ProcessManager } from "./processManager";
import { isWeakAgentPlan, optimizeForQwen, reviewGeneratedActions } from "./qwenOptimizer";
import { learnFromTask, readWorkspaceMemory } from "./workspaceMemory";

export type AgentStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

export type AgentTimelineEvent = {
  id: string;
  icon: string;
  title: string;
  description: string;
  timestamp: string;
  durationMs?: number;
  status: "pending" | "running" | "done" | "error";
};

const STEP_TIMEOUT_MS = 120000;

export class AgentRunner {
  private diffManager: DiffManager | null = null;
  private lastResult: AgentResult | null = null;
  private lastContext: WorkspaceCtx = {};
  private readonly normalizer = new EventNormalizer();
  private readonly processManager = new ProcessManager();
  private cancelled = false;
  private currentTask = "";
  private readonly serverRunner: ServerRunner;
  private readonly errorCounts = new Map<string, number>();
  private recentAppliedFiles: string[] = [];
  private readonly steps: AgentStep[] = [
    { id: "understand", label: "Understanding request", status: "pending" },
    { id: "workspace", label: "Reading workspace", status: "pending" },
    { id: "detect", label: "Detecting project type", status: "pending" },
    { id: "inspect", label: "Inspecting files", status: "pending" },
    { id: "plan", label: "Planning changes", status: "pending" },
    { id: "edit", label: "Preparing file edits", status: "pending" },
    { id: "write", label: "Writing files", status: "pending" },
    { id: "diff", label: "Previewing diff", status: "pending" },
    { id: "checks", label: "Running checks", status: "pending" },
    { id: "review", label: "Finalizing", status: "pending" },
  ];

  constructor(
    private readonly client: MeldexApiClient,
    private readonly onStep: (steps: AgentStep[]) => void,
    private readonly onTimeline: (event: AgentTimelineEvent) => void,
    private readonly onPatch: (summary: PatchSummary, result: AgentResult) => void,
    private readonly onResult: (result: AgentResult, applied: string[]) => void,
    private readonly onError: (msg: string, retryable?: boolean) => void,
    private readonly onLog?: (line: string, stream: "stdout" | "stderr") => void,
    private readonly onTerminalResult?: (result: RunResult & { command: string; durationMs: number; cwd: string }) => void,
    private readonly onServerStatus?: (status: ServerStatus) => void,
    private readonly storageRoot?: string
  ) {
    this.serverRunner = new ServerRunner((line, stream) => this.onLog?.(line, stream));
  }

  async run(task: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      this.onError("Open a workspace folder before running the agent.", false);
      return;
    }

    this.currentTask = task;
    const cliHandled = await this.runViaCli(task, root);
    if (cliHandled) return;

    this.resetSteps();
    const requestStarted = Date.now();
    this.event("request", "", "Request received", this.shortTask(task), requestStarted, "done");
    this.mark("understand", "running");
    await new Promise((resolve) => setTimeout(resolve, 150));
    this.mark("understand", "done", `Understood: ${this.shortTask(task)}`);

    this.mark("workspace", "running");
    const started = Date.now();
    try {
      const maxFiles = vscode.workspace.getConfiguration("meldex").get<number>("maxFilesToSend") ?? 20;
      const built = await this.withTimeout(ContextBuilder.build(root, task, maxFiles), STEP_TIMEOUT_MS, "Workspace scan");
      this.lastContext = built.context;
      const memory = readWorkspaceMemory(this.storageRoot || root);
      const aoePlan = buildAutonomousPlan({
        task,
        projectType: built.projectType,
        packageManager: built.packageManager,
        relevantFiles: built.relevantFiles.map((file) => file.path),
        packageJson: built.context.packageJson,
        memory,
        hasActiveFile: !!built.context.activeFile,
      });
      for (const summary of safeReasoningSummary(aoePlan)) {
        this.event(`aoe-${summary.slice(0, 16)}`, "", "Orchestration", summary, Date.now(), "done");
      }
      if (planNeedsUserInput(aoePlan)) {
        this.onError(`Need clarification before continuing. Confidence ${aoePlan.confidence}%. Please add one or two specifics.`, false);
        return;
      }
      const optimized = optimizeForQwen(task, built, undefined, autonomousPromptSection(aoePlan));
      this.currentTask = optimized.task;
      this.mark("workspace", "done", `${this.lastContext.projectFiles?.length ?? 0} files indexed`);
      this.event("workspace", "", "Read workspace", `${this.lastContext.projectFiles?.length ?? 0} files indexed`, started, "done");
      this.event("qwen-profile", "", "Selected Qwen profile", `${optimized.profile} · ${optimized.reasoningSummary.join(" ")}`, Date.now(), "done");
    } catch (error) {
      this.mark("workspace", "error", error instanceof Error ? error.message : String(error));
      this.onError(`Workspace scan failed: ${this.steps[1].detail}`, true);
      return;
    }

    this.mark("detect", "running");
    await new Promise((resolve) => setTimeout(resolve, 120));
    const projectType = this.lastContext.projectType ?? "Unknown project";
    const packageManager = this.lastContext.packageManager ?? "no package manager";
    this.mark("detect", "done", `Workspace detected: ${projectType}`);
    this.event("detect", "", "Project detected", `${projectType} · ${packageManager}`, Date.now(), "done");

    this.mark("inspect", "running");
    await new Promise((resolve) => setTimeout(resolve, 120));
    this.mark("inspect", "done", this.lastContext.activeFile ? `Active file: ${this.lastContext.activeFile}` : "Project context ready");
    this.event("inspect", "", "Inspect files", "Safe workspace context prepared", Date.now(), "done");

    this.mark("plan", "running");
    let result: AgentResult;
    let stillWorkingTimer: NodeJS.Timeout | undefined;
    let longRunningTimer: NodeJS.Timeout | undefined;
    try {
      stillWorkingTimer = setTimeout(() => {
        this.mark("plan", "running", "Still working...");
        this.event("plan-wait-10", "", "Still working", "Coding Brain is preparing a safe patch", Date.now(), "running");
      }, 10_000);
      longRunningTimer = setTimeout(() => {
        this.mark("plan", "running", "Taking longer than expected");
        this.event("plan-wait-30", "", "Taking longer than expected", "You can continue waiting or retry if needed", Date.now(), "running");
      }, 30_000);
      result = await this.withTimeout(this.client.runAgent(this.normalizeTask(this.currentTask), this.lastContext), STEP_TIMEOUT_MS, "Agent planning");
      if (isWeakAgentPlan(result)) {
        this.event("qwen-repair", "", "Repair action JSON", "Regenerating once because the first action plan was weak.", Date.now(), "running");
        result = await this.withTimeout(
          this.client.runAgent(`${this.currentTask}\n\nThe previous response was weak. Return valid action JSON with plan, files, commands, validation, and summary only.`, this.lastContext),
          STEP_TIMEOUT_MS,
          "Agent JSON repair"
        );
      }
      if (result.error) throw new Error(result.error);
      this.lastResult = result;
      this.mark("plan", "done", `${result.plan?.length ?? 0} planned step(s)`);
      this.event("plan", "", "Plan changes", result.plan?.[0] ?? "Implementation plan prepared", Date.now(), "done");
    } catch (error) {
      this.mark("plan", "error", error instanceof Error ? error.message : "Agent failed");
      this.onError(this.steps.find((step) => step.id === "plan")?.detail ?? "Agent failed", true);
      return;
    } finally {
      if (stillWorkingTimer) clearTimeout(stillWorkingTimer);
      if (longRunningTimer) clearTimeout(longRunningTimer);
    }

    const files = result.files ?? [];
    const reviewFindings = reviewGeneratedActions(files);
    this.event(
      "self-review",
      "",
      reviewFindings.length ? "Self-review found issues" : "Self-review passed",
      reviewFindings.length ? reviewFindings.slice(0, 3).join("; ") : "Imports, paths, and action shape checked.",
      Date.now(),
      reviewFindings.length ? "error" : "done"
    );
    if (reviewFindings.length) {
      this.onError(`Self-review blocked unsafe/weak patch: ${reviewFindings.join("; ")}`, true);
      return;
    }
    this.mark("edit", "running", `${files.length} file proposal(s)`);
    this.diffManager = new DiffManager(root, this.storageRoot);
    let summary: PatchSummary | null = null;
    try {
      summary = await this.diffManager.calculate(files);
      this.mark("edit", "done", `${summary.files.length} file patch(es)`);
      this.mark("write", "running", `Files planned: ${summary.files.map((file) => file.path).slice(0, 4).join(", ")}`);
      for (const file of summary.files) {
        this.event(
          `file-${file.id}`,
          "",
          file.operation === "create" ? `Creating ${file.path}` : file.operation === "delete" ? `Deleting ${file.path}` : `Editing ${file.path}`,
          `${file.path} · +${file.added} -${file.removed}`,
          Date.now(),
          "done"
        );
      }
      this.mark("write", "done", `${summary.files.length} file change(s) prepared`);
    } catch (error) {
      this.mark("edit", "error", error instanceof Error ? error.message : String(error));
      this.onError(`Patch preparation failed: ${this.steps[4].detail}`, true);
      return;
    }

    this.mark("diff", "running", `+${summary.totalAdded} -${summary.totalRemoved}`);
    await this.diffManager.showChanges(summary);
    this.mark("diff", "done", "Waiting for Accept / Reject");
    this.event("diff", "", "Review changes", `${summary.files.length} file(s) ready for review`, Date.now(), "done");
    this.onPatch(summary, result);
  }

  private async runViaCli(task: string, root: string): Promise<boolean> {
    const extensionRoot = path.resolve(__dirname, "..", "..");
    const token = await this.client.getToken();
    if (!token) {
      this.onError("Sign in before running the agent.", false);
      return true;
    }

    this.resetSteps();
    this.cancelled = false;
    this.mark("understand", "running", "Starting task");
    const started = Date.now();
    this.event("agent-start", "", "Start task", "Local agent is working", started, "running");

    let buffer = "";
    const result: AgentResult = { plan: [], files: [], commands: [], summary: "" };

    await new Promise<void>((resolve) => {
      this.processManager.launchCli({
        extensionRoot,
        workspaceRoot: root,
        storageRoot: this.storageRoot,
        args: [
          "run",
          task,
          "--workspace",
          root,
          "--backend",
          this.client.getApiUrl(),
          "--storage-dir",
          this.storageRoot || "",
        ],
        env: { MELDEX_TOKEN: token },
        onStdout: (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as Record<string, unknown>;
              this.handleCliEvent(event, result);
            } catch {
              this.onLog?.(line, "stdout");
            }
          }
        },
        onStderr: (chunk: Buffer) => {
          const text = chunk.toString();
          this.onLog?.(text, "stderr");
        },
        onExit: (code) => {
          if (buffer.trim()) {
            try {
              this.handleCliEvent(JSON.parse(buffer) as Record<string, unknown>, result);
            } catch {
              this.onLog?.(buffer, "stdout");
            }
          }
          if (this.cancelled) {
            this.mark("review", "done", "Stopped");
            resolve();
            return;
          }
          if (code !== 0) {
            this.mark("review", "error", `CLI exited with code ${code}`);
            this.onError(`Agent stopped with exit code ${code}`, true);
          }
          resolve();
        },
        onError: (message) => {
          this.mark("review", "error", message);
          this.onError(message, true);
          resolve();
        },
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.mark("review", "error", message);
        this.onError(message, true);
        resolve();
      });
    });

    if (result.files?.length) {
      this.diffManager = new DiffManager(root, this.storageRoot);
      const summary = await this.diffManager.calculate(result.files);
      await this.diffManager.showChanges(summary);
      this.mark("diff", "done", "Waiting for Accept / Reject");
      this.onPatch(summary, result);
    } else if (result.summary) {
      this.mark("review", "done", result.summary);
      this.onResult(result, []);
    }
    if (this.cancelled) return true;
    this.event("agent-done", "", "Task completed", "Finished", started, "done", Date.now() - started);
    return true;
  }

  private handleCliEvent(event: Record<string, unknown>, result: AgentResult): void {
    if (event.type === "server_status") {
      this.onServerStatus?.({
        status: String(event.status || "idle") as ServerStatus["status"],
        url: typeof event.url === "string" ? event.url : undefined,
        port: typeof event.port === "number" ? event.port : undefined,
        command: typeof event.command === "string" ? event.command : undefined,
        pid: typeof event.pid === "number" ? event.pid : undefined,
        logs: Array.isArray(event.logs) ? event.logs.map(String) : [],
        error: typeof event.error === "string" ? event.error : undefined,
        projectKind: typeof event.projectKind === "string" ? event.projectKind as ServerStatus["projectKind"] : undefined,
      });
    }
    for (const clean of this.normalizer.normalize(event)) {
      if (clean.kind === "step") {
        this.mark(clean.id, clean.status, clean.detail);
      } else if (clean.kind === "tool") {
        this.event(clean.id, "", clean.title, clean.description, Date.now(), clean.status, clean.durationMs);
      } else if (clean.kind === "patch") {
        result.files = clean.files;
      } else if (clean.kind === "terminal") {
        if (clean.stdout) this.onLog?.(clean.stdout, "stdout");
        if (clean.stderr) this.onLog?.(clean.stderr, "stderr");
      } else if (clean.kind === "error") {
        this.onError(clean.message, clean.retryable);
      } else if (clean.kind === "summary") {
        result.summary = clean.summary;
      }
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.processManager.kill();
    this.mark("review", "done", "Stopped");
  }

  async openDiff(patchId: string): Promise<void> {
    await this.diffManager?.openFileDiff(patchId);
  }

  async rejectAll(): Promise<string[]> {
    const rejected = this.diffManager?.rejectAll() ?? [];
    this.mark("review", "done", "Changes rejected");
    return rejected;
  }

  async undoLastPatch() {
    return this.diffManager?.undoLastPatch() ?? { restored: [], errors: [] };
  }

  async applyAll(): Promise<{ applied: string[]; errors: string[] }> {
    if (!this.diffManager) return { applied: [], errors: ["No pending patch"] };
    this.mark("diff", "done", "Accepted");
    const result = await this.diffManager.applyAll();
    if (result.applied.length) {
      this.recentAppliedFiles = result.applied;
      this.event("applied-files", "", "Apply patch", `Applied ${result.applied.length} file(s).`, Date.now(), "done");
    }
    if (result.errors.length) {
      this.mark("review", "error", result.errors[0]);
      return result;
    }

    await this.runChecksWithRetries(0);
    return result;
  }

  private async runChecksWithRetries(attempt: number): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root || !this.lastResult) return;
    const shouldExecute = requestNeedsExecution(this.currentTask);
    const commands = (this.lastResult.commands?.length ? this.lastResult.commands : shouldExecute ? detectValidationCommands(root) : []);
    if (!commands.length) {
      this.mark("checks", shouldExecute ? "running" : "done", shouldExecute ? "Starting preview" : "No checks requested");
      if (shouldExecute) {
        await this.maybeStartServer(root);
        this.mark("review", "done", this.lastResult.summary ?? "Completed");
        this.event("summary", "", "Summary ready", this.lastResult.summary ?? "Completed", Date.now(), "done");
        this.onResult(this.lastResult, []);
      } else {
        this.mark("review", "done", this.lastResult.summary ?? "Changes ready");
        this.event("summary", "", "Summary ready", this.lastResult.summary ?? "Changes ready", Date.now(), "done");
        this.onResult(this.lastResult, []);
      }
      return;
    }

    this.mark("checks", "running", attempt > 0 ? `Retry ${attempt}/5` : "Running commands");
    for (const command of commands) {
      if (/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b/i.test(command)) {
        const allowed = await this.confirmInstall(command);
        if (!allowed) {
          this.event(`blocked-install-${attempt}`, "", "Install skipped", command, Date.now(), "error");
          continue;
        }
      }
      if (!isCommandAllowed(command)) {
        this.event(`blocked-${command}`, "", "Command blocked", command, Date.now(), "error");
        continue;
      }
      const started = Date.now();
      this.onLog?.(`$ ${command}`, "stdout");
      const run = await runProcess(command, root, (line, stream) => this.onLog?.(line, stream), STEP_TIMEOUT_MS);
      const durationMs = Date.now() - started;
      this.onTerminalResult?.({ ...run, command, durationMs, cwd: root });
      this.event(
        `cmd-${command}-${attempt}`,
        "",
        run.exitCode === 0 ? "Command executed" : "Build failed",
        `${command} · exit ${run.exitCode} · ${durationMs}ms`,
        started,
        run.exitCode === 0 ? "done" : "error",
        durationMs
      );
      if (run.exitCode !== 0) {
        const raw = run.stderr || run.stdout || `Command failed: ${command}`;
        const parsed = parseAgentError(raw);
        const fingerprint = errorFingerprint(parsed);
        const seen = (this.errorCounts.get(fingerprint) ?? 0) + 1;
        this.errorCounts.set(fingerprint, seen);
        this.event(
          `parsed-error-${attempt}`,
          "",
          seen > 1 ? "Repeated issue" : "Parsed error",
          `${parsed.title}${parsed.file ? ` · ${parsed.file}` : ""}`,
          Date.now(),
          "error"
        );
        if (seen >= 2) {
          this.mark("checks", "error", `Same error repeated: ${parsed.title}`);
          this.onError(`Same error repeated twice: ${parsed.title}\n${parsed.message}`, true);
          return;
        }
        if (attempt >= 4) {
          this.mark("checks", "error", `Failed after ${attempt + 1} attempt(s)`);
          this.onError(raw, true);
          return;
        }
        await this.requestFixAndPreview(raw, attempt + 1);
        return;
      }
    }
    this.mark("checks", "done", "Checks passed");
    await this.maybeStartServer(root);
    learnFromTask(this.storageRoot || root, {
      projectSummary: this.lastContext.projectType,
      edits: this.recentAppliedFiles,
      commands,
      fixes: this.errorCounts.size ? ["Autofix loop completed"] : [],
      style: ["Preserve existing conventions", "Prefer minimal patches"],
    });
    this.mark("review", "done", this.lastResult.summary ?? "Completed");
    this.event("checks-complete", "", "Checks completed", "All requested commands finished", Date.now(), "done");
    this.event("summary", "", "Summary ready", this.lastResult.summary ?? "Completed", Date.now(), "done");
    this.onResult(this.lastResult, []);
  }

  async stopServer(): Promise<ServerStatus> {
    const status = this.serverRunner.stop();
    this.onServerStatus?.(status);
    this.event("server-stop", "", "Stop server", status.url ?? "Server stopped", Date.now(), "done");
    return status;
  }

  private async maybeStartServer(root: string): Promise<void> {
    if (!requestNeedsServer(this.currentTask)) return;
    this.mark("checks", "running", "Starting local server");
    this.event("server-start", "", "Start local server", "Launching preview server", Date.now(), "running");
    const status = await this.serverRunner.start(root);
    this.onServerStatus?.(status);
    if (status.status === "running") {
      this.mark("checks", "done", status.verified ? `Preview verified: ${status.url}` : `Preview ready: ${status.url}`);
      this.event("server-ready", "", status.verified ? "Preview verified" : "Preview ready", status.url ?? "Local server running", Date.now(), "done");
    } else {
      this.mark("checks", "error", status.error ?? "Server failed");
      this.event("server-error", "", "Server failed", status.error ?? "Could not start local server", Date.now(), "error");
      const raw = [...(status.logs ?? []), status.error ?? "Could not start local server"].join("\n");
      if (raw && this.lastResult) {
        await this.requestFixAndPreview(raw, 1);
      } else {
        this.onError(status.error ?? "Could not start local server", true);
      }
    }
  }

  private async requestFixAndPreview(error: string, attempt: number): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const parsed = parseAgentError(error);
    this.mark("review", "running", `Fixing issue ${attempt}/5`);
    this.event(
      `fixing-${attempt}`,
      "",
      `Fixing issue ${attempt}/5`,
      `${parsed.title}${parsed.file ? ` · ${parsed.file}` : ""}`,
      Date.now(),
      "running"
    );
    const fix = buildFixTask({
      root,
      taskGoal: this.currentTask,
      error: parsed,
      rawOutput: error,
      recentFiles: this.recentAppliedFiles,
    });
    const result = await this.withTimeout(
      this.client.runAgent(fix.task, { ...this.lastContext, ...fix.context }),
      STEP_TIMEOUT_MS,
      "Fix attempt"
    );
    this.lastResult = result;
    if (!root || !result.files?.length) {
      this.mark("review", "error", "No fix patch returned");
      return;
    }
    this.diffManager = new DiffManager(root, this.storageRoot);
    const summary = await this.diffManager.calculate(result.files);
    this.mark("edit", "done", `Fix patch ${attempt}`);
    this.mark("diff", "done", `Fix ready +${summary.totalAdded} -${summary.totalRemoved}`);
    this.event(`fix-${attempt}`, "", "Fix prepared", `Prepared retry patch ${attempt}/5`, Date.now(), "done");
    await this.diffManager.showChanges(summary);
    this.onPatch(summary, result);
  }

  private async confirmInstall(command: string): Promise<boolean> {
    const match = command.match(/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\s+([^;&|]+)/i);
    const dep = match?.[1]?.trim() || "dependencies";
    const choice = await vscode.window.showInformationMessage(
      `Install missing dependency ${dep}?`,
      { modal: true },
      "Install",
      "Skip"
    );
    return choice === "Install";
  }

  private resetSteps() {
    for (const step of this.steps) {
      step.status = "pending";
      step.detail = undefined;
    }
    this.normalizer.reset();
    this.errorCounts.clear();
    this.recentAppliedFiles = [];
    this.onStep([...this.steps]);
  }

  private normalizeTask(task: string): string {
    const lower = task.toLowerCase();
    const emptyOrUnknown = !this.lastContext.projectFiles?.length || this.lastContext.projectType === "Unknown";
    if (emptyOrUnknown && lower.includes("simple landing page") && !lower.includes("index.html")) {
      return `${task}\n\nUse a static workspace structure and create exactly these files unless they already exist: index.html, style.css, script.js, README.md.`;
    }
    return task;
  }

  private shortTask(task: string): string {
    const clean = task.replace(/\s+/g, " ").trim();
    return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean || "Agent task";
  }

  private mark(id: string, status: AgentStep["status"], detail?: string) {
    const step = this.steps.find((item) => item.id === id);
    if (!step) return;
    step.status = status;
    step.detail = detail;
    this.onStep([...this.steps]);
  }

  private event(id: string, icon: string, title: string, description: string, startedAt: number, status: AgentTimelineEvent["status"], durationMs?: number) {
    this.onTimeline({
      id,
      icon,
      title,
      description,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      durationMs: durationMs ?? Math.max(0, Date.now() - startedAt),
      status,
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
  }
}
