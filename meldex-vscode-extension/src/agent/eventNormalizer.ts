import { AgentResult } from "../api/client";

export type NormalizedEvent =
  | { kind: "step"; id: string; label?: string; status: "pending" | "running" | "done" | "error"; detail?: string }
  | { kind: "tool"; id: string; title: string; description: string; status: "pending" | "running" | "done" | "error"; durationMs?: number }
  | { kind: "patch"; files: AgentResult["files"] }
  | { kind: "terminal"; stdout?: string; stderr?: string }
  | { kind: "summary"; summary: string }
  | { kind: "error"; message: string; retryable: boolean };

export class EventNormalizer {
  private seen = new Set<string>();
  private editedFiles = new Set<string>();

  reset(): void {
    this.seen.clear();
    this.editedFiles.clear();
  }

  normalize(event: Record<string, unknown>): NormalizedEvent[] {
    const type = String(event.type || "");
    if (!type) return [];

    if (type === "thinking") return this.normalizeThinking(String(event.message || "Working"));
    if (type === "plan") return this.once("plan", [
      { kind: "step", id: "plan", label: "Planned changes", status: "done", detail: String(event.objective || "Plan ready") },
      { kind: "tool", id: "plan", title: "Plan changes", description: "Prepared the implementation approach.", status: "done" },
    ]);
    if (type === "tool_start") return this.normalizeTool(event, "running");
    if (type === "tool_result") return this.normalizeTool(event, String(event.status || "").toLowerCase().includes("fail") ? "error" : "done");
    if (type === "file_change") return this.normalizeFileChange(event);
    if (type === "diff") return this.once("diff", [
      { kind: "step", id: "diff", label: "Reviewed changes", status: "done", detail: `+${Number(event.totalAdded || 0)} -${Number(event.totalRemoved || 0)}` },
      { kind: "tool", id: "review-changes", title: "Review changes", description: `${Array.isArray(event.files) ? event.files.length : 0} file(s) ready for review.`, status: "done" },
    ]);
    if (type === "patch") {
      const files = Array.isArray(event.files) ? event.files as AgentResult["files"] : [];
      return [
        { kind: "step", id: "write", label: `Edited ${files?.length || 0} files`, status: "done", detail: `${files?.length || 0} file change(s) prepared` },
        { kind: "patch", files },
      ];
    }
    if (type === "terminal") {
      return [{ kind: "terminal", stdout: typeof event.stdout === "string" ? event.stdout : undefined, stderr: typeof event.stderr === "string" ? event.stderr : undefined }];
    }
    if (type === "mil_insight") {
      const quality = typeof event.quality === "object" && event.quality ? (event.quality as { overall?: number }).overall : undefined;
      const risk = String(event.risk || "unknown");
      return [
        { kind: "tool", id: "mil-insight", title: "Insight panel", description: `Quality ${quality ?? "n/a"}/100 · Risk ${risk}`, status: "done" },
        { kind: "summary", summary: String(event.summary || `Quality ${quality ?? "n/a"}/100 · Risk ${risk}`) },
      ];
    }
    if (type === "retry") {
      return this.once(`retry-${String(event.message || "retry")}`, [
        { kind: "tool", id: "retry", title: "Retry", description: "Retrying after a recoverable error.", status: "running" },
      ]);
    }
    if (type === "error") {
      return [{ kind: "step", id: "review", label: "Needs attention", status: "error", detail: String(event.message || "Agent error") }, { kind: "error", message: String(event.message || "Agent error"), retryable: true }];
    }
    if (type === "summary" || type === "done") {
      return this.once("summary", [
        { kind: "step", id: "review", label: "Reviewed result", status: "done", detail: String(event.summary || "Agent completed") },
        { kind: "summary", summary: String(event.summary || "Agent completed") },
      ]);
    }
    return [];
  }

  private normalizeThinking(message: string): NormalizedEvent[] {
    const lower = message.toLowerCase();
    if (lower.includes("under")) {
      return this.once("thinking-understand", [{ kind: "step", id: "understand", label: "Understood request", status: "done", detail: "Request is clear." }]);
    }
    if (lower.includes("index") || lower.includes("workspace") || lower.includes("read")) {
      return this.once("thinking-workspace", [
        { kind: "step", id: "workspace", label: "Read workspace", status: "done", detail: "Workspace context loaded." },
        { kind: "tool", id: "read-workspace", title: "Read workspace", description: "Loaded project files and workspace context.", status: "done" },
      ]);
    }
    if (lower.includes("analy") || lower.includes("inspect")) {
      return this.once("thinking-inspect", [{ kind: "step", id: "inspect", label: "Inspected files", status: "done", detail: "Relevant files checked." }]);
    }
    if (lower.includes("edit") || lower.includes("write")) {
      return this.once("thinking-edit", [{ kind: "step", id: "write", label: "Editing files", status: "running", detail: "Preparing file changes." }]);
    }
    return this.once(`thinking-${this.slug(message)}`, [{ kind: "step", id: "plan", label: "Planned changes", status: "running", detail: "Preparing the implementation." }]);
  }

  private normalizeTool(event: Record<string, unknown>, status: "running" | "done" | "error"): NormalizedEvent[] {
    const tool = String(event.tool || "tool").toLowerCase();
    const command = typeof event.command === "string" ? event.command : "";
    const durationMs = Number(event.durationMs || 0) || undefined;
    if (tool.includes("backend") || tool.includes("api") || tool.includes("cli")) return [];
    if (tool.includes("aoe") || tool.includes("orchestrator")) {
      const confidence = typeof event.confidence === "number" ? `Confidence ${event.confidence}%` : "Autonomous workflow prepared.";
      return this.once(`tool-aoe-${status}`, [{ kind: "tool", id: "aoe-orchestrator", title: "Plan autonomous workflow", description: confidence, status, durationMs: this.visibleDuration(durationMs) }]);
    }
    if (tool.includes("qwen")) {
      return this.once(`tool-qwen-${status}`, [{ kind: "tool", id: "qwen-optimizer", title: "Optimize Qwen context", description: String(event.profile || "Qwen3-Coder context prepared."), status, durationMs: this.visibleDuration(durationMs) }]);
    }
    if (tool.includes("mil_intelligence")) {
      const risk = String(event.risk || "unknown");
      const quality = typeof event.quality === "object" && event.quality ? (event.quality as { overall?: number }).overall : undefined;
      return this.once(`tool-mil-${status}`, [{ kind: "tool", id: "mil-intelligence", title: "Run intelligence layer", description: `Predicted next steps · Risk ${risk} · Quality ${quality ?? "n/a"}/100`, status, durationMs: this.visibleDuration(durationMs) }]);
    }
    if (tool.includes("mil_risk")) {
      const risk = String(event.risk || "unknown");
      return this.once(`tool-mil-risk-${status}`, [{ kind: "tool", id: "mil-risk", title: "Analyze risk and impact", description: `Risk ${risk}`, status, durationMs: this.visibleDuration(durationMs) }]);
    }
    if (tool.includes("self_review")) {
      const findings = Array.isArray(event.findings) && event.findings.length ? `${event.findings.length} issue(s)` : "Patch passed internal review.";
      return this.once(`tool-self-review-${status}`, [{ kind: "tool", id: "self-review", title: "Self-review patch", description: findings, status, durationMs: this.visibleDuration(durationMs) }]);
    }
    if (tool.includes("index") || tool.includes("workspace")) {
      return this.once(`tool-workspace-${status}`, [{ kind: "tool", id: "read-workspace", title: "Read workspace", description: "Workspace context loaded.", status, durationMs: this.visibleDuration(durationMs) }]);
    }
    if (tool.includes("terminal") || command) {
      return [{ kind: "tool", id: `command-${this.slug(command || tool)}`, title: status === "error" ? "Command failed" : status === "done" ? "Command finished" : "Run command", description: command || "Running command", status, durationMs: this.visibleDuration(durationMs) }];
    }
    if (tool.includes("patch") || tool.includes("file") || tool.includes("fast")) {
      return this.once(`tool-edit-${status}`, [{ kind: "tool", id: "edit-files", title: "Edit files", description: status === "running" ? "Preparing file edits." : "File edits prepared.", status, durationMs: this.visibleDuration(durationMs) }]);
    }
    return [];
  }

  private normalizeFileChange(event: Record<string, unknown>): NormalizedEvent[] {
    const filePath = String(event.path || "");
    if (filePath) this.editedFiles.add(filePath);
    return [
      { kind: "step", id: "write", label: `Edited ${this.editedFiles.size} files`, status: "running", detail: `${this.editedFiles.size} file(s) prepared` },
      { kind: "tool", id: "edit-files", title: "Edit files", description: `${this.editedFiles.size} file(s) changed.`, status: "running" },
    ];
  }

  private once(key: string, events: NormalizedEvent[]): NormalizedEvent[] {
    if (this.seen.has(key)) return [];
    this.seen.add(key);
    return events;
  }

  private visibleDuration(durationMs?: number): number | undefined {
    return durationMs && durationMs >= 500 ? durationMs : undefined;
  }

  private slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "item";
  }
}
