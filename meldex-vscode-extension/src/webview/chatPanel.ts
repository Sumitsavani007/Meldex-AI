import * as vscode from "vscode";
import * as path from "path";
import { ExtensionHealth, MeldexApiClient, MeldexApiError, ChatMessage, MeldexUser, WorkspaceCtx } from "../api/client";
import { WorkspaceContext } from "../context/workspace";
import { AgentRunner, AgentStep, AgentTimelineEvent } from "../agent/agentRunner";
import { QueuedTask, TaskQueue } from "../agent/taskQueue";
import { AgentResult } from "../api/client";
import { PatchSummary } from "../agent/patchEngine";
import { ServerStatus } from "../terminal/serverRunner";

export class MeldexChatProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private client: MeldexApiClient;
  private history: ChatMessage[] = [];
  private user: MeldexUser | null = null;
  private _lastTask = "";
  private runner: AgentRunner | null = null;
  private readonly taskQueue = new TaskQueue();
  private authTimer: NodeJS.Timeout | undefined;
  private googlePollTimer: NodeJS.Timeout | undefined;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.client = new MeldexApiClient(ctx.secrets);
    this.client.onAuthInvalid((message) => {
      void this.handleAuthInvalid(message);
    });
    this.client.loadToken().then(ok => {
      if (ok) this.verifyAndInit();
    });
  }

  private async handleAuthInvalid(message = "Token revoked. Please login again.") {
    this.runner?.cancel();
    this.taskQueue.cancelCurrent();
    await this.client.clearToken();
    this.user = null;
    this.history = [];
    if (this.authTimer) clearInterval(this.authTimer);
    this.post({ type: "authInvalid", message });
    this.post({ type: "disconnected" });
  }

  private startAuthPolling() {
    if (this.authTimer) clearInterval(this.authTimer);
    this.authTimer = setInterval(() => {
      if (this.client.isAuthenticated()) {
        this.client.currentUser().catch(() => {});
      }
    }, 60_000);
  }

  private async verifyAndInit() {
    try {
      const token = await this.ctx.secrets.get("meldex.apiToken");
      if (!token) return;
      const health = await this.client.health(token);
      this.user = health.user;
      this.post({ type: "connected", user: this.user });
      this.postHealth(health);
      this.startAuthPolling();
    } catch (error) {
      await this.client.clearToken();
      this.postConnectionError(error);
      this.post({ type: "disconnected" });
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.ctx.extensionUri] };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string;
      token?: string;
      message?: string;
      mode?: string;
      files?: { operation: "create" | "edit" | "delete"; path: string; content: string }[];
      patchId?: string;
      url?: string;
      taskId?: string;
    }) => {
      switch (msg.type) {
        case "ready": {
          const ok = await this.client.loadToken();
          const apiUrl = this.client.getApiUrl();
          if (ok) {
            await this.verifyAndInit();
          }
          this.post({ type: "init", connected: ok, user: this.user, apiUrl });
          break;
        }

        case "connect": {
          const raw = msg.token?.trim();
          if (!raw) { this.post({ type: "connectError", message: "Paste your API token first" }); return; }
          this.post({ type: "connecting" });
          try {
            const health = await this.client.health(raw);
            await this.client.saveToken(raw);
            this.user = health.user;
            this.post({ type: "connected", user: health.user });
            this.postHealth(health);
            this.startAuthPolling();
          } catch (e) {
            this.postConnectionError(e);
            this.post({ type: "connectError", message: e instanceof Error ? e.message : "Connection failed" });
          }
          break;
        }

        case "loginWithEmail": {
          this.post({ type: "connectError", message: "Email/password login is no longer used in the extension. Use Google or Access Token." });
          break;
        }

        case "loginWithGoogle": {
          this.post({ type: "googleConnecting" });
          try {
            const started = await this.client.startGoogleConnect();
            this.post({ type: "googleCode", ...started });
            vscode.env.openExternal(vscode.Uri.parse(started.verificationUri));
            if (this.googlePollTimer) clearInterval(this.googlePollTimer);
            const expiresAt = new Date(started.expiresAt).getTime();
            this.googlePollTimer = setInterval(async () => {
              if (Date.now() > expiresAt) {
                if (this.googlePollTimer) clearInterval(this.googlePollTimer);
                this.post({ type: "connectError", message: "Google sign-in code expired. Try again." });
                return;
              }
              try {
                const poll = await this.client.pollGoogleConnect(started.deviceCode);
                if (poll.status !== "approved" || !poll.token) return;
                if (this.googlePollTimer) clearInterval(this.googlePollTimer);
                await this.client.saveToken(poll.token);
                const health = await this.client.health();
                this.user = health.user;
                this.post({ type: "connected", user: health.user });
                this.postHealth(health);
                this.startAuthPolling();
              } catch (error) {
                this.postConnectionError(error);
              }
            }, Math.max(1000, started.interval * 1000));
          } catch (e) {
            this.postConnectionError(e);
            this.post({ type: "connectError", message: e instanceof Error ? e.message : "Google sign-in failed" });
          }
          break;
        }

        case "disconnect": {
          const revoke = (msg as unknown as { revoke?: boolean }).revoke === true;
          if (revoke) await this.client.revokeCurrentToken().catch(() => {});
          await this.client.clearToken();
          if (this.authTimer) clearInterval(this.authTimer);
          this.runner?.cancel();
          this.taskQueue.cancelCurrent();
          this.user = null;
          this.history = [];
          this.post({ type: "disconnected" });
          break;
        }

        case "refreshAuth": {
          try {
            const user = await this.client.currentUser();
            this.user = user;
            this.post({ type: "connected", user });
            this.post({ type: "authRefreshed" });
          } catch (e) {
            this.postConnectionError(e);
          }
          break;
        }

        case "chat": {
          if (!this.client.isAuthenticated()) { this.post({ type: "error", message: "Not connected" }); return; }
          const content = msg.message ?? "";
          const mode = msg.mode ?? "chat";
          this.history.push({ role: "user", content });
          this.post({ type: "userMessage", content });

          if (mode === "agent") {
            this._lastTask = content;
            if (this.taskQueue.isRunning) {
              const queued = this.taskQueue.enqueue(content, "agent", "queue");
              this.postQueueState();
              this.post({ type: "taskQueued", task: queued, count: this.taskQueue.queuedTasks.length });
              return;
            }
            await this.startAgentTask(content);
            return;
          }

          this.post({ type: "assistantStart" });
          try {
            const ctx = await WorkspaceContext.gather(15).catch(() => ({} as WorkspaceCtx));
            let full = "";
            await this.client.chat(this.history, ctx, chunk => {
              full += chunk;
              this.post({ type: "chunk", chunk });
            });
            this.history.push({ role: "assistant", content: full });
            this.post({ type: "assistantDone" });
          } catch (e) {
            this.postConnectionError(e);
            this.post({ type: "error", message: e instanceof Error ? e.message : "Chat failed" });
          }
          break;
        }

        case "clearChat": {
          this.history = [];
          this.post({ type: "chatCleared" });
          break;
        }

        case "openDiff": {
          if (msg.patchId) await this.runner?.openDiff(msg.patchId);
          break;
        }

        case "applyAll": {
          const result = await this.runner?.applyAll();
          this.post({ type: "filesApplied", applied: result?.applied ?? [], errors: result?.errors ?? [] });
          break;
        }

        case "rejectAll": {
          const rejected = await this.runner?.rejectAll();
          this.post({ type: "filesRejected", rejected });
          break;
        }

        case "undoLastPatch": {
          const result = await this.runner?.undoLastPatch();
          this.post({ type: "undoComplete", restored: result?.restored ?? [], errors: result?.errors ?? [] });
          break;
        }

        case "retryAgent": {
          if (this._lastTask) await this.startAgentTask(this._lastTask);
          break;
        }

        case "stopAgent": {
          this.runner?.cancel();
          this.taskQueue.cancelCurrent();
          this.post({ type: "taskStopped" });
          this.postQueueState();
          break;
        }

        case "openPreview": {
          if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        }

        case "stopServer": {
          const status = await this.runner?.stopServer();
          if (status) this.post({ type: "serverStatus", status });
          break;
        }

        case "forkTask": {
          const content = msg.message?.trim();
          if (!content) break;
          const fork = this.taskQueue.enqueue(content, "agent", "fork");
          this.postQueueState();
          this.post({ type: "taskForked", task: fork, count: this.taskQueue.queuedTasks.length });
          break;
        }

        case "removeQueuedTask": {
          if (msg.taskId) this.taskQueue.remove(msg.taskId);
          this.postQueueState();
          break;
        }

        case "openTokenPage": {
          const apiUrl = this.client.getApiUrl();
          vscode.env.openExternal(vscode.Uri.parse(`${apiUrl}/settings/tokens`));
          break;
        }

        case "setApiUrl": {
          if (msg.url) {
            await vscode.workspace.getConfiguration("meldex").update("apiUrl", msg.url.trim().replace(/\/+$/, ""), vscode.ConfigurationTarget.Global);
          }
          break;
        }
      }
    });
  }

  private async runAgent(task: string): Promise<void> {
    this.runner = new AgentRunner(
      this.client,
      (steps: AgentStep[]) => this.post({ type: "agentSteps", steps }),
      (event: AgentTimelineEvent) => this.post({ type: "agentTimeline", event }),
      (summary: PatchSummary, result: AgentResult) => this.post({ type: "patchPreview", summary, result }),
      (result: AgentResult, applied: string[]) => this.post({ type: "agentResult", result, applied }),
      (message: string, retryable?: boolean) => this.post({ type: "agentError", message, retryable: !!retryable }),
      (line: string, stream: "stdout" | "stderr") => this.post({ type: "cmdOutput", line, stream }),
      (result) => this.post({ type: "terminalResult", result }),
      (status: ServerStatus) => this.post({ type: "serverStatus", status }),
      this.ctx.globalStorageUri.fsPath
    );
    await this.runner.run(task);
  }

  private async startAgentTask(task: string | QueuedTask): Promise<void> {
    const runningTask = this.taskQueue.start(task);
    this.post({ type: "taskState", state: "running", current: runningTask, count: this.taskQueue.queuedTasks.length });
    this.post({ type: "agentStart", task: runningTask });
    try {
      await this.runAgent(runningTask.prompt);
      this.taskQueue.completeCurrent();
      this.post({ type: "taskState", state: "idle", count: this.taskQueue.queuedTasks.length });
    } catch (error) {
      this.taskQueue.failCurrent();
      this.post({ type: "agentError", message: error instanceof Error ? error.message : "Agent failed", retryable: true });
      this.post({ type: "taskState", state: "idle", count: this.taskQueue.queuedTasks.length });
    }
    await this.runNextQueued();
  }

  private async runNextQueued(): Promise<void> {
    if (this.taskQueue.isRunning) return;
    const next = this.taskQueue.next();
    this.postQueueState();
    if (next) {
      this.post({ type: "queuedTaskStarted", task: next, count: this.taskQueue.queuedTasks.length });
      await this.startAgentTask(next);
    }
  }

  private postQueueState(): void {
    this.post({ type: "queueState", running: this.taskQueue.isRunning, count: this.taskQueue.queuedTasks.length, queued: this.taskQueue.queuedTasks });
  }

  sendPrompt(prompt: string, mode: "chat" | "agent"): void {
    this.post({ type: "injectPrompt", prompt, mode });
  }

  updateContext(ctx: Partial<WorkspaceCtx>): void {
    if (ctx.activeFile) {
      this.post({ type: "contextUpdate", file: path.basename(ctx.activeFile) });
    }
  }

  private post(msg: unknown): void {
    this.view?.webview.postMessage(msg);
  }

  private postHealth(health: ExtensionHealth): void {
    const modelReachable = health.model.status === "ok";
    this.post({
      type: "connectionStatus",
      status: modelReachable ? "model_reachable" : health.model.status,
      label: modelReachable ? "Model reachable" : this.connectionLabelForModel(health.model.status),
      detail: `Connected · Backend reachable · ${health.model.provider}`,
    });
  }

  private postConnectionError(error: unknown): void {
    const statusCode = error instanceof MeldexApiError ? error.statusCode : undefined;
    const code = error instanceof MeldexApiError ? error.code : undefined;
    const message = error instanceof Error ? error.message : "Connection failed";
    if (statusCode === 401 || message.toLowerCase().includes("token")) {
      this.post({ type: "connectionStatus", status: "token_invalid", label: "Token invalid", detail: "Sign in again" });
    } else if (statusCode === 429 || message.toLowerCase().includes("rate")) {
      this.post({ type: "connectionStatus", status: "rate_limited", label: "Rate limited", detail: "Try again shortly" });
    } else if (code === "offline" || message.toLowerCase().includes("network") || message.toLowerCase().includes("timeout") || message.toLowerCase().includes("resolve")) {
      this.post({ type: "connectionStatus", status: "offline", label: "Offline", detail: "Backend unreachable" });
    } else {
      this.post({ type: "connectionStatus", status: "backend_reachable", label: "Backend reachable", detail: message });
    }
  }

  private connectionLabelForModel(status: ExtensionHealth["model"]["status"]): string {
    switch (status) {
      case "rate_limited": return "Rate limited";
      case "offline": return "Offline";
      case "not_configured": return "Model unavailable";
      case "error": return "Backend reachable";
      default: return "Model reachable";
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meldex AI</title>
<style nonce="${nonce}">
:root{
  --bg:#0d0d0d;--sur:#111111;--sur2:#171717;--sur3:#202020;
  --bdr:#262626;--bdr2:#343434;
  --tx:#f5f5f5;--tx2:#a1a1aa;--tx3:#71717a;
  --am:#ffffff;--am2:#e5e5e5;--amd:rgba(255,255,255,0.08);
  --gr:#10b981;--grd:rgba(16,185,129,0.12);
  --vl:#8b5cf6;--rd:#ef4444;--rdd:rgba(239,68,68,0.12);--bl:#3b82f6;
  --r:8px;--rs:5px;--font:-apple-system,'Segoe UI',system-ui,sans-serif;--mono:'Cascadia Code','Fira Code',Consolas,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{background:var(--bg);color:var(--tx);font-family:var(--font);font-size:13px;display:flex;flex-direction:column}

/* Header */
.hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 11px;background:var(--sur);border-bottom:1px solid var(--bdr);flex-shrink:0}
.brand{display:flex;align-items:center;gap:7px}
.bmark{width:21px;height:21px;background:#f5f5f5;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#000}
.bname{font-size:13px;font-weight:700;color:var(--tx)}
.hdot{width:6px;height:6px;border-radius:50%;background:var(--tx3);transition:all .3s}
.hdot.on{background:var(--gr);box-shadow:0 0 6px rgba(16,185,129,0.5)}
.hdot.err{background:var(--rd)}
.hdot.warn{background:var(--am);box-shadow:0 0 6px rgba(245,158,11,0.35)}
.hdr-r{display:flex;align-items:center;gap:5px}
.upill{font-size:10px;color:var(--tx2);background:var(--sur2);border:1px solid var(--bdr);padding:2px 8px;border-radius:20px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ibtn{background:transparent;border:none;color:var(--tx2);cursor:pointer;padding:4px;border-radius:4px;font-size:13px;line-height:1;transition:color .15s,background .15s;display:flex;align-items:center;justify-content:center}
.ibtn:hover{color:var(--tx);background:var(--sur2)}

/* Screens */
.screen{display:none;flex-direction:column;flex:1;overflow:hidden}
.screen.active{display:flex}

/* ── Login screen ── */
.login-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;gap:14px}
.login-logo{width:52px;height:52px;background:#f5f5f5;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#000}
.login-title{font-size:16px;font-weight:700;text-align:center;color:var(--tx)}
.login-sub{font-size:12px;color:var(--tx2);text-align:center;line-height:1.5}
.login-card{width:100%;display:flex;flex-direction:column;gap:10px}
.google-btn{width:100%;padding:10px;background:#f5f5f5;color:#000;border:none;border-radius:var(--r);font-size:13px;font-weight:750;cursor:pointer;transition:opacity .15s;display:flex;align-items:center;justify-content:center;gap:8px}
.google-btn:hover{opacity:.9}.google-btn:disabled{opacity:.45;cursor:not-allowed}
.inp{width:100%;background:var(--sur2);border:1px solid var(--bdr2);border-radius:var(--r);padding:10px 13px;color:var(--tx);font-size:13px;font-family:var(--font);outline:none;transition:border-color .15s,box-shadow .15s}
.inp:focus{border-color:var(--am);box-shadow:0 0 0 3px var(--amd)}
.inp::placeholder{color:var(--tx2)}
.login-fields{width:100%;display:flex;flex-direction:column;gap:9px}
.login-sep{display:flex;align-items:center;gap:8px;width:100%;color:var(--tx3);font-size:10px;text-transform:uppercase;letter-spacing:.7px;margin:2px 0}
.login-sep:before,.login-sep:after{content:'';height:1px;background:var(--bdr);flex:1}
.btn-login{width:100%;padding:10px;background:#f5f5f5;color:#000;border:none;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s;margin-top:2px}
.btn-login:hover{opacity:.9}
.btn-login:disabled{opacity:.45;cursor:not-allowed}
.btn-token{width:100%;padding:9px;background:var(--sur2);color:var(--tx);border:1px solid var(--bdr2);border-radius:var(--r);font-size:12px;font-weight:650;cursor:pointer;transition:border-color .15s,color .15s}
.btn-token:hover{border-color:rgba(245,158,11,.35);color:var(--am)}
.link-btn{background:transparent;border:0;color:var(--tx2);font-size:11px;text-align:center;cursor:pointer;padding:3px}.link-btn:hover{color:var(--tx)}
.device-code{display:none;width:100%;border:1px solid var(--bdr);background:var(--sur2);border-radius:var(--r);padding:10px;text-align:center}
.device-code strong{display:block;font-family:var(--mono);font-size:17px;letter-spacing:1px;color:var(--tx);margin-top:4px}
.logout-options{display:none;align-items:center;gap:7px;color:var(--tx2);font-size:11px}
.logout-options input{accent-color:#fff}
.login-err{font-size:11.5px;color:var(--rd);text-align:center;padding:8px 11px;background:var(--rdd);border:1px solid rgba(239,68,68,0.2);border-radius:var(--rs)}

/* ── Chat screen ── */
.msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}
.msgs::-webkit-scrollbar{width:3px}
.msgs::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px}
.msg{animation:fadeup .18s ease}
@keyframes fadeup{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.mmeta{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--tx2);margin-bottom:3px}
.mmeta .spacer{flex:1}
.copy-mini{opacity:0;background:transparent;border:1px solid transparent;color:var(--tx2);font-size:10px;border-radius:4px;padding:1px 5px;cursor:pointer;transition:opacity .15s,color .15s,border-color .15s}
.msg:hover .copy-mini,.agent-inline:hover .copy-mini,.termlog:hover .copy-mini,.errmsg:hover .copy-mini,.summary-ok:hover .copy-mini{opacity:1}
.copy-mini:hover{color:var(--tx);border-color:var(--bdr2)}
.copy-mini.ok{opacity:1;color:var(--gr);border-color:rgba(16,185,129,.25)}
.av{width:16px;height:16px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0}
.av.u{background:#2a2a2a;color:#fff}.av.ai{background:#f5f5f5;color:#000}
.mbody{background:var(--sur);border:1px solid var(--bdr);border-radius:var(--r);padding:8px 11px;line-height:1.65;font-size:12.5px}
.msg.user .mbody{background:var(--sur2);border-color:rgba(139,92,246,0.2)}
.mbody p{margin:3px 0}.mbody p:first-child{margin-top:0}.mbody p:last-child{margin-bottom:0}
.mbody h1,.mbody h2,.mbody h3{font-size:13px;font-weight:600;margin:6px 0 3px;color:var(--am)}
.mbody ul,.mbody ol{padding-left:16px;margin:4px 0}.mbody li{margin:2px 0}
.mbody strong{color:var(--tx);font-weight:600}.mbody em{color:var(--tx2)}
.mbody a{color:var(--am);text-decoration:none}.mbody a:hover{text-decoration:underline}
.cwrap{margin:6px 0}.chdr{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--tx2);background:var(--sur2);border:1px solid var(--bdr);border-bottom:none;padding:3px 9px;border-radius:5px 5px 0 0}
.ccopy{background:transparent;border:none;color:var(--tx2);cursor:pointer;font-size:10px;padding:1px 6px;border-radius:3px;transition:color .15s}
.ccopy:hover{color:var(--tx)}.ccopy.ok{color:var(--gr)}
pre{background:#040409;border:1px solid var(--bdr);border-radius:0 0 5px 5px;padding:8px 11px;overflow-x:auto;margin:0}
pre code{font-family:var(--mono);font-size:11.5px;line-height:1.6;color:#abb2bf;background:none;padding:0;border-radius:0}
code{font-family:var(--mono);font-size:11px;background:rgba(255,255,255,0.07);color:var(--am2);padding:1px 5px;border-radius:3px}
.typing{display:flex;align-items:center;gap:4px;padding:8px 11px;background:var(--sur);border:1px solid var(--bdr);border-radius:var(--r);width:fit-content}
.typing span{width:4px;height:4px;background:var(--am);border-radius:50%;animation:dot .9s infinite}
.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}
.errmsg{background:var(--rdd);border:1px solid rgba(239,68,68,0.25);color:var(--rd);padding:8px 11px;border-radius:var(--r);font-size:12px}
.err-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;margin-bottom:3px}

/* Agent inline */
.agent-inline{background:var(--sur);border:1px solid var(--bdr);border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:9px;box-shadow:0 12px 30px rgba(0,0,0,.16)}
.agent-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.atitle{font-size:10px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.7px}
.livechip{font-size:10px;color:var(--am);display:flex;align-items:center;gap:5px}.livechip:before{content:'';width:5px;height:5px;border-radius:50%;background:var(--am);animation:gpulse 1.1s infinite}
.fold{border:1px solid var(--bdr);background:rgba(255,255,255,.02);border-radius:var(--rs);overflow:hidden}
.fold-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 9px;cursor:pointer;user-select:none}
.fold-title{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:var(--tx)}
.fold-caret{color:var(--tx2);font-size:10px;transition:transform .15s}.fold.open .fold-caret{transform:rotate(90deg)}
.fold-body{display:none;padding:0 9px 9px}.fold.open .fold-body{display:block}
.astep{display:flex;align-items:flex-start;gap:8px;position:relative;padding:4px 0;animation:fadeup .18s ease}
.astep:not(:last-of-type)::after{content:'';position:absolute;left:8px;top:21px;width:1px;height:calc(100% - 2px);background:var(--bdr)}
.adot{width:17px;height:17px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;z-index:1;position:relative}
.adot.pending{background:var(--sur2);border:1px solid var(--bdr2);color:var(--tx3)}
.adot.running{background:var(--amd);border:1px solid var(--am);animation:gpulse 1.2s infinite}
.adot.done{background:var(--grd);border:1px solid var(--gr);color:var(--gr)}
.adot.error{background:var(--rdd);border:1px solid var(--rd);color:var(--rd)}
@keyframes gpulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}50%{box-shadow:0 0 7px rgba(245,158,11,0.4)}}
.ainfo{flex:1;min-width:0;padding-top:2px}
.alabel{font-size:11.5px;color:var(--tx2)}.alabel.running{color:var(--am)}.alabel.done{color:var(--tx)}.alabel.error{color:var(--rd)}
.adetail{font-size:10px;color:var(--tx3);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.events,.tools{display:flex;flex-direction:column;gap:7px}
.event{display:grid;grid-template-columns:20px 1fr auto;gap:8px;align-items:start;padding:7px 0;border-bottom:1px solid var(--bdr)}
.event:last-child{border-bottom:0}
.eico{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:var(--sur2);border:1px solid var(--bdr2);font-size:10px;color:var(--am)}
.etxt{min-width:0}.evt-title{font-size:11.5px;color:var(--tx);font-weight:600}.evt-desc{font-size:10px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.etime{font-size:9.5px;color:var(--tx3);white-space:nowrap;text-align:right}.event.error .eico{color:var(--rd);background:var(--rdd);border-color:rgba(239,68,68,.25)}
.tool-card{border:1px solid var(--bdr);border-radius:7px;background:rgba(0,0,0,.13);overflow:hidden;animation:fadeup .18s ease}
.tool-h{display:grid;grid-template-columns:20px 1fr auto;gap:8px;align-items:center;padding:7px 8px;cursor:pointer}
.tool-ico{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;background:var(--sur2);border:1px solid var(--bdr2);color:var(--tx2);font-size:10px}
.tool-title{font-size:11.5px;font-weight:650;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tool-status{font-size:9.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px}
.tool-card.done .tool-status{color:var(--gr)}.tool-card.running .tool-status{color:var(--am)}.tool-card.error .tool-status{color:var(--rd)}
.tool-body{display:none;padding:0 8px 8px 36px;font-size:10.5px;color:var(--tx2);line-height:1.45}.tool-card.open .tool-body{display:block}
.reason{border:1px solid rgba(16,185,129,.18);background:rgba(16,185,129,.065);border-radius:7px;padding:8px 10px;color:rgba(255,255,255,.86);font-size:11.5px;line-height:1.55;animation:fadeup .2s ease}
.reason-title{font-size:10px;font-weight:700;color:var(--gr);text-transform:uppercase;letter-spacing:.65px;margin-bottom:4px}
.reason ul{padding-left:16px;margin:0}.reason li{margin:2px 0}
.cursor{display:inline-block;width:6px;height:13px;background:var(--am);margin-left:2px;vertical-align:-2px;animation:blink .9s infinite}
@keyframes blink{0%,45%{opacity:1}46%,100%{opacity:.15}}
.term-wrap{border:1px solid var(--bdr);border-radius:var(--rs);background:#050505;overflow:hidden}
.term-head{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px;color:var(--tx2);font-family:var(--font)}
.termlog{display:none;padding:7px 9px;max-height:130px;overflow-y:auto;font-family:var(--mono);font-size:10.5px;line-height:1.6}.term-wrap.open .termlog{display:block}
.termlog::-webkit-scrollbar{width:3px}.termlog::-webkit-scrollbar-thumb{background:var(--bdr2)}
.changes-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.delta{font-family:var(--mono);font-size:11px}.delta .add{color:var(--gr)}.delta .rem{color:var(--rd)}
.changed-files{display:flex;flex-direction:column;gap:1px;border:1px solid var(--bdr);border-radius:7px;padding:3px 7px;background:rgba(0,0,0,.14)}
.frow{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid var(--bdr);cursor:pointer;transition:background .15s,transform .15s}
.frow:hover{transform:translateX(2px)}
.frow:hover .fname{color:var(--am)}
.frow:last-child{border-bottom:none}
.fbadge{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0}
.fbadge.create{background:var(--grd);color:var(--gr)}.fbadge.edit{background:rgba(59,130,246,0.1);color:var(--bl)}.fbadge.delete{background:var(--rdd);color:var(--rd)}
.fname{font-size:11px;font-family:var(--mono);color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fdelta{font-family:var(--mono);font-size:10px;white-space:nowrap}.fdelta .add{color:var(--gr)}.fdelta .rem{color:var(--rd)}
.apply-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.apply-btn{flex:1;padding:6px;font-size:11px;font-weight:600;cursor:pointer;border-radius:var(--rs);border:none;transition:opacity .15s}
.apply-btn:hover{opacity:.85}
.apply-btn.yes{background:#f5f5f5;color:#000}.apply-btn.no{background:var(--sur2);border:1px solid var(--bdr2);color:var(--tx2)}.apply-btn.undo{background:transparent;border:1px solid var(--bdr2);color:var(--tx2)}
.term-result{margin-top:6px;border:1px solid var(--bdr);border-radius:var(--rs);padding:7px 9px;background:rgba(255,255,255,.02);font-size:10.5px;color:var(--tx2)}
.server-card{margin-top:8px;border:1px solid rgba(16,185,129,.24);border-radius:8px;background:rgba(16,185,129,.075);padding:9px 10px;display:flex;flex-direction:column;gap:8px;animation:fadeup .18s ease}
.server-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.server-title{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;color:var(--tx)}
.server-dot{width:7px;height:7px;border-radius:50%;background:var(--gr);box-shadow:0 0 7px rgba(16,185,129,.55)}
.server-dot.starting{background:var(--am);animation:gpulse 1.1s infinite}
.server-dot.error{background:var(--rd);box-shadow:none}
.server-url{font-family:var(--mono);font-size:11px;color:var(--gr);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.server-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.server-btn{border:1px solid var(--bdr2);background:var(--sur2);color:var(--tx);border-radius:5px;padding:5px 4px;font-size:10px;cursor:pointer}
.server-btn:hover{border-color:rgba(16,185,129,.35)}
.server-logs{display:none;max-height:120px;overflow:auto;border-top:1px solid rgba(16,185,129,.16);padding-top:7px;font-family:var(--mono);font-size:10px;line-height:1.5;color:var(--tx2)}
.server-card.open .server-logs{display:block}
.summary-ok{background:var(--grd);border:1px solid rgba(16,185,129,0.2);color:rgba(255,255,255,0.85);padding:8px 11px;border-radius:var(--r);font-size:12px;position:relative}
.summary-ok .copy-mini{position:absolute;right:7px;top:6px}
.retry-btn{width:100%;padding:7px;background:var(--rdd);border:1px solid rgba(239,68,68,0.25);color:var(--rd);border-radius:var(--rs);font-size:11px;font-weight:600;cursor:pointer;transition:background .15s}
.retry-btn:hover{background:rgba(239,68,68,0.2)}

/* Compose */
.compose{border-top:1px solid var(--bdr);padding:8px 10px;background:var(--sur);flex-shrink:0}
.mrow{display:flex;gap:4px;margin-bottom:7px}
.mpill{flex:1;padding:4px 6px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx2);border-radius:20px;font-size:10px;cursor:pointer;transition:all .15s;text-align:center}
.mpill.active{background:var(--amd);border-color:rgba(245,158,11,0.3);color:var(--am)}
.mpill:hover:not(.active){color:var(--tx)}
.tawrap{position:relative}
textarea{width:100%;background:var(--sur2);border:1px solid var(--bdr2);border-radius:var(--r);padding:8px 36px 8px 11px;color:var(--tx);font-size:12px;font-family:var(--font);resize:none;min-height:38px;max-height:120px;outline:none;overflow-y:auto;line-height:1.5;transition:border-color .15s,box-shadow .15s}
textarea:focus{border-color:var(--am);box-shadow:0 0 0 3px var(--amd)}
textarea::placeholder{color:var(--tx2)}
.sndbtn{position:absolute;right:7px;bottom:7px;width:23px;height:23px;border-radius:5px;border:none;background:var(--am);color:#000;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:background .15s,opacity .15s}
.sndbtn:hover{background:var(--am2)}.sndbtn:disabled{opacity:.35;cursor:not-allowed}
.ctxbar{display:flex;align-items:center;gap:5px;margin-top:5px}
.work-status{display:none;align-items:center;gap:7px;padding:7px 10px;border-bottom:1px solid var(--bdr);background:var(--sur);font-size:11px;color:var(--tx2)}
.work-status.active{display:flex}.spin{width:8px;height:8px;border-radius:50%;border:1px solid var(--tx3);border-top-color:var(--tx);animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.qactions{display:none;align-items:center;gap:6px;margin-bottom:7px}.qactions.active{display:flex}
.qbtn{border:1px solid var(--bdr);background:var(--sur2);color:var(--tx2);border-radius:6px;font-size:10px;padding:4px 8px;cursor:pointer}.qbtn:hover{color:var(--tx);border-color:var(--bdr2)}
.qbadge{margin-left:auto;font-size:10px;color:var(--tx3)}
.queued-card{border:1px solid var(--bdr);background:rgba(255,255,255,.025);border-radius:8px;padding:8px 10px;color:var(--tx2);font-size:11.5px;animation:fadeup .18s ease}
.fpill{font-size:10px;color:var(--tx2);background:var(--sur2);border:1px solid var(--bdr);padding:1px 7px;border-radius:20px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clrbtn{margin-left:auto;background:transparent;border:none;color:var(--tx2);font-size:10px;cursor:pointer;padding:2px 5px;border-radius:3px;transition:color .15s}
.clrbtn:hover{color:var(--tx)}

/* Footer */
.footer{padding:5px 11px;background:var(--sur);border-top:1px solid var(--bdr);font-size:10px;color:var(--tx2);display:flex;align-items:center;gap:5px;flex-shrink:0}
.fdot{width:5px;height:5px;border-radius:50%;background:var(--tx3);flex-shrink:0}
.fdot.on{background:var(--gr)}
.fdot.warn{background:var(--am)}.fdot.err{background:var(--rd)}

/* Empty state */
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;text-align:center}
.ei{font-size:22px;opacity:.4}.et{font-size:14px;font-weight:600;color:var(--tx)}.es{font-size:11px;color:var(--tx3);line-height:1.55}
.chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:6px}
.chip{font-size:10px;background:var(--sur2);border:1px solid var(--bdr);padding:4px 9px;border-radius:20px;color:var(--tx2);cursor:pointer;transition:all .15s}
.chip:hover{background:var(--amd);border-color:rgba(245,158,11,0.3);color:var(--am)}
</style>
</head>
<body>

<!-- ── Header ──────────────────────────────────────────────────────── -->
<div class="hdr">
  <div class="brand">
    <div class="bmark">M</div>
    <span class="bname">Meldex</span>
    <div class="hdot" id="hdot"></div>
  </div>
  <div class="hdr-r">
    <span id="upill" class="upill" style="display:none"></span>
    <button class="ibtn" id="refreshAuthBtn" title="Refresh auth status" style="display:none">Refresh</button>
    <button class="ibtn" id="disconnBtn" title="Disconnect" style="display:none">Sign out</button>
  </div>
</div>

<!-- ── Login screen ─────────────────────────────────────────────── -->
<div id="connScreen" class="screen">
  <div class="login-wrap">
    <div class="login-logo">M</div>
    <div class="login-title">Meldex AI</div>
    <div class="login-sub">Sign in to your Meldex account</div>
    <div class="login-card">
      <button id="googleBtn" class="google-btn">Continue with Google</button>
      <div id="deviceCode" class="device-code">
        <span>Complete sign-in in your browser</span>
        <strong id="deviceCodeText"></strong>
      </div>
      <div class="login-sep">Use Access Token</div>
      <div class="login-fields">
        <input id="tokenInput" class="inp" type="password" placeholder="Paste mdx_ access token" autocomplete="off" spellcheck="false"/>
        <button id="tokenBtn" class="btn-token">Connect</button>
        <button id="openTokenBtn" class="link-btn">Open token page</button>
      </div>
      <div id="loginErr" class="login-err" style="display:none"></div>
    </div>
  </div>
</div>

<!-- ── Chat screen ────────────────────────────────────────────────── -->
<div id="chatScreen" class="screen" style="flex-direction:column">
  <div id="workStatus" class="work-status"><span class="spin"></span><span>Meldex is working...</span><span id="queueCount" class="qbadge"></span></div>
  <div class="msgs" id="msgs">
    <div class="empty" id="emptyState">
      <div class="ei">M</div>
      <div class="et">What are we building?</div>
      <div class="es">Chat about code or ask the agent to make a safe, reviewable change.</div>
      <div class="chips">
        <div class="chip" data-p="Explain the current file" data-m="chat">Explain file</div>
        <div class="chip" data-p="Fix bugs in the current file" data-m="agent">Fix bugs</div>
        <div class="chip" data-p="Add TypeScript types" data-m="agent">Add types</div>
        <div class="chip" data-p="Generate unit tests" data-m="agent">Gen tests</div>
        <div class="chip" data-p="Create a landing page with index.html, style.css, script.js, README.md" data-m="agent">Landing page</div>
      </div>
    </div>
  </div>

  <div class="compose">
    <div id="queueActions" class="qactions">
      <button class="qbtn" id="stopBtn">Stop</button>
      <button class="qbtn" id="forkBtn">Fork</button>
      <span class="qbadge" id="queueBadge">Queue 0</span>
    </div>
    <div class="mrow">
      <button class="mpill active" data-mode="chat">Chat</button>
      <button class="mpill" data-mode="agent">Agent</button>
    </div>
    <div class="tawrap">
      <textarea id="chatIn" placeholder="Ask anything… (Shift+Enter for newline)" rows="1"></textarea>
      <button id="sndBtn" class="sndbtn" disabled>▲</button>
    </div>
    <div class="ctxbar">
      <span id="fpill" class="fpill" style="display:none"></span>
      <button class="clrbtn" id="clrBtn">Clear</button>
    </div>
  </div>
</div>

<!-- ── Footer ─────────────────────────────────────────────────────── -->
<div class="footer" id="footer">
  <div class="fdot" id="fdot"></div>
  <span id="ftext">Not connected</span>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let mode = 'chat';
let pendingFiles = [];
let curAiEl = null;
let curContent = '';
let lastRetryable = false;
let connectionStatus = { state: 'disconnected', label: 'Not connected', detail: '' };
let agentRunning = false;
let queuedCount = 0;

// ── Messages from extension ─────────────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  switch(m.type) {
    case 'init':
      if (m.connected && m.user) showChat(m.user);
      else showConnect();
      break;
    case 'connecting':
      document.getElementById('tokenBtn').disabled = true;
      document.getElementById('tokenBtn').textContent = 'Connecting…';
      document.getElementById('loginErr').style.display = 'none';
      break;
    case 'googleConnecting':
      document.getElementById('googleBtn').disabled = true;
      document.getElementById('googleBtn').textContent = 'Opening browser…';
      document.getElementById('loginErr').style.display = 'none';
      break;
    case 'googleCode':
      document.getElementById('googleBtn').textContent = 'Waiting for approval…';
      document.getElementById('deviceCode').style.display = 'block';
      document.getElementById('deviceCodeText').textContent = m.userCode || '';
      break;
    case 'connected':
      showChat(m.user);
      break;
    case 'connectionStatus':
      connectionStatus = { state: m.status || 'connected', label: m.label || 'Connected', detail: m.detail || '' };
      renderConnectionStatus();
      break;
    case 'connectError':
      document.getElementById('googleBtn').disabled = false;
      document.getElementById('googleBtn').textContent = 'Continue with Google';
      document.getElementById('tokenBtn').disabled = false;
      document.getElementById('tokenBtn').textContent = 'Connect';
      const errEl = document.getElementById('loginErr');
      errEl.textContent = m.message || 'Sign in failed';
      errEl.style.display = 'block';
      renderConnectionStatus();
      break;
    case 'authInvalid':
      addErrMsg(m.message || 'Token revoked. Please login again.');
      break;
    case 'authRefreshed':
      addStatusLine('Auth status refreshed.', 'ok');
      break;
    case 'disconnected':
      showConnect();
      break;
    case 'userMessage': addUserMsg(m.content); break;
    case 'assistantStart': curAiEl = addAiMsg(''); curContent = ''; break;
    case 'chunk':
      curContent += m.chunk;
      if (curAiEl) { curAiEl.dataset.raw = curContent; curAiEl.innerHTML = renderMd(curContent); scrollBot(); }
      break;
    case 'assistantDone': curAiEl = null; removeTyping(); break;
    case 'agentStart':
      agentRunning = true;
      renderTaskState();
      addAgentCard();
      break;
    case 'agentSteps': updateTimeline(m.steps); break;
    case 'agentTimeline': appendEvent(m.event); break;
    case 'patchPreview': renderPatchPreview(m.summary, m.result); break;
    case 'agentResult': handleAgentResult(m.result, m.applied); break;
    case 'agentError':
      lastRetryable = m.retryable;
      addAgentError(m.message, m.retryable);
      break;
    case 'taskState':
      agentRunning = m.state === 'running';
      queuedCount = m.count || 0;
      renderTaskState();
      break;
    case 'queueState':
      agentRunning = !!m.running;
      queuedCount = m.count || 0;
      renderTaskState();
      break;
    case 'taskQueued':
      queuedCount = m.count || queuedCount;
      addQueuedTask(m.task, 'Queued · will run next');
      renderTaskState();
      break;
    case 'taskForked':
      queuedCount = m.count || queuedCount;
      addQueuedTask(m.task, 'Fork queued · independent direction');
      renderTaskState();
      break;
    case 'queuedTaskStarted':
      queuedCount = m.count || 0;
      addStatusLine('Starting queued task: ' + (m.task?.prompt || ''), 'neutral');
      renderTaskState();
      break;
    case 'taskStopped':
      agentRunning = false;
      addStatusLine('Stopped. You can continue when ready.', 'neutral');
      renderTaskState();
      break;
    case 'cmdOutput': appendTermLog(m.line, m.stream); break;
    case 'terminalResult': appendTerminalResult(m.result); break;
    case 'serverStatus': renderServerCard(m.status); break;
    case 'filesApplied':
      markPatchApplied(m.applied || [], m.errors || []);
      break;
    case 'filesRejected':
      markPatchRejected(m.rejected || []);
      break;
    case 'undoComplete':
      addStatusLine((m.errors?.length ? 'Undo completed with errors: ' + m.errors.join(', ') : 'Undo complete: ' + (m.restored || []).join(', ')), m.errors?.length ? 'error' : 'ok');
      break;
    case 'error': removeTyping(); addErrMsg(m.message); break;
    case 'chatCleared':
      document.getElementById('msgs').innerHTML = '';
      document.getElementById('msgs').appendChild(makeEmpty());
      break;
    case 'contextUpdate':
      if (m.file) {
        const p = document.getElementById('fpill');
        p.textContent = m.file;
        p.style.display = 'inline';
      }
      break;
    case 'injectPrompt':
      const ta = document.getElementById('chatIn');
      ta.value = m.prompt || '';
      if (m.mode) setMode(m.mode);
      ta.dispatchEvent(new Event('input'));
      break;
  }
});

vscode.postMessage({ type: 'ready' });

// ── UI state ────────────────────────────────────────────────────────
function showConnect() {
  document.getElementById('connScreen').classList.add('active');
  document.getElementById('chatScreen').classList.remove('active');
  document.getElementById('upill').style.display = 'none';
  document.getElementById('disconnBtn').style.display = 'none';
  document.getElementById('refreshAuthBtn').style.display = 'none';
  document.getElementById('googleBtn').disabled = false;
  document.getElementById('googleBtn').textContent = 'Continue with Google';
  document.getElementById('tokenBtn').disabled = false;
  document.getElementById('tokenBtn').textContent = 'Connect';
  document.getElementById('deviceCode').style.display = 'none';
  document.getElementById('loginErr').style.display = 'none';
  document.getElementById('tokenInput').value = '';
  setDot('off');
  if (connectionStatus.state === 'token_invalid' || connectionStatus.state === 'offline' || connectionStatus.state === 'rate_limited') renderConnectionStatus();
  else setFooter(false, '');
}

function showChat(user) {
  document.getElementById('connScreen').classList.remove('active');
  document.getElementById('chatScreen').classList.add('active');
  const name = user?.name || user?.email?.split('@')[0] || 'User';
  document.getElementById('upill').textContent = name;
  document.getElementById('upill').style.display = 'inline';
  document.getElementById('disconnBtn').style.display = 'flex';
  document.getElementById('refreshAuthBtn').style.display = 'flex';
  connectionStatus = { state: 'connected', label: 'Connected', detail: name + ' · meldex.newsyfly.com' };
  renderConnectionStatus();
}

function setDot(state) {
  const d = document.getElementById('hdot');
  d.className = 'hdot ' + (state === true || state === 'on' ? 'on' : state === 'warn' ? 'warn' : state === 'err' ? 'err' : '');
  const fd = document.getElementById('fdot');
  fd.className = 'fdot ' + (state === true || state === 'on' ? 'on' : state === 'warn' ? 'warn' : state === 'err' ? 'err' : '');
}
function setFooter(on, text) {
  document.getElementById('ftext').textContent = on ? text : 'Not connected';
}
function renderConnectionStatus() {
  const s = connectionStatus.state;
  const label = connectionStatus.label || 'Connected';
  const detail = connectionStatus.detail ? ' · ' + connectionStatus.detail : '';
  if (s === 'model_reachable') {
    setDot('on'); setFooter(true, 'Connected · Backend reachable · Model reachable');
  } else if (s === 'backend_reachable' || s === 'not_configured' || s === 'error') {
    setDot('warn'); setFooter(true, label + detail);
  } else if (s === 'rate_limited') {
    setDot('warn'); setFooter(true, 'Rate limited · Backend reachable');
  } else if (s === 'token_invalid') {
    setDot('err'); setFooter(true, 'Token invalid');
  } else if (s === 'offline') {
    setDot('err'); setFooter(true, 'Offline');
  } else {
    setDot('on'); setFooter(true, label + detail);
  }
}

// ── Login events ────────────────────────────────────────────────────
document.getElementById('googleBtn').addEventListener('click', () => vscode.postMessage({ type: 'loginWithGoogle' }));
document.getElementById('tokenBtn').addEventListener('click', doTokenConnect);
document.getElementById('openTokenBtn').addEventListener('click', () => vscode.postMessage({ type: 'openTokenPage' }));
document.getElementById('refreshAuthBtn').addEventListener('click', () => vscode.postMessage({ type: 'refreshAuth' }));
document.getElementById('tokenInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doTokenConnect();
});
document.getElementById('disconnBtn').addEventListener('click', () => {
  const revoke = confirm('Revoke this token on logout?');
  vscode.postMessage({ type: 'disconnect', revoke });
});

function doTokenConnect() {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) {
    const e = document.getElementById('loginErr');
    e.textContent = 'Paste an mdx_ access token';
    e.style.display = 'block';
    return;
  }
  vscode.postMessage({ type: 'connect', token });
}

// ── Mode ────────────────────────────────────────────────────────────
document.querySelectorAll('.mpill').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mpill').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  document.getElementById('chatIn').placeholder = m === 'agent' ? 'Describe what to build or fix…' : 'Ask anything…';
  renderTaskState();
}

// ── Chips ───────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const copyBtn = e.target.closest('[data-copy], .copy-response, .term-copy, .ccopy');
  if (copyBtn) {
    e.preventDefault();
    e.stopPropagation();
    let text = copyBtn.dataset.copy || '';
    if (copyBtn.classList.contains('copy-response')) {
      text = copyBtn.closest('.msg')?.querySelector('.mbody')?.dataset.raw || copyBtn.closest('.msg')?.innerText || '';
    } else if (copyBtn.classList.contains('term-copy')) {
      text = copyBtn.closest('.term-wrap')?.querySelector('.termlog')?.innerText || '';
    } else if (copyBtn.dataset.copyCode) {
      text = document.getElementById(copyBtn.dataset.copyCode)?.textContent || '';
    }
    copyText(copyBtn, text);
    return;
  }
  const c = e.target.closest('.chip[data-p]');
  if (!c) return;
  document.getElementById('chatIn').value = c.dataset.p;
  setMode(c.dataset.m || 'chat');
  document.getElementById('chatIn').dispatchEvent(new Event('input'));
  document.getElementById('sndBtn').click();
});

// ── Send ────────────────────────────────────────────────────────────
const chatIn = document.getElementById('chatIn');
const sndBtn = document.getElementById('sndBtn');
chatIn.addEventListener('input', () => {
  chatIn.style.height = 'auto';
  chatIn.style.height = Math.min(chatIn.scrollHeight, 120) + 'px';
  sndBtn.disabled = !chatIn.value.trim();
});
chatIn.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });
sndBtn.addEventListener('click', send);
document.getElementById('clrBtn').addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));
document.getElementById('stopBtn').addEventListener('click', () => vscode.postMessage({ type: 'stopAgent' }));
document.getElementById('forkBtn').addEventListener('click', () => {
  const text = chatIn.value.trim();
  if (!text) return;
  chatIn.value = ''; chatIn.style.height = 'auto'; sndBtn.disabled = true;
  vscode.postMessage({ type: 'forkTask', message: text });
});

function send() {
  const text = chatIn.value.trim();
  if (!text) return;
  chatIn.value = ''; chatIn.style.height = 'auto'; sndBtn.disabled = true;
  if (mode !== 'agent') addTyping();
  vscode.postMessage({ type: 'chat', message: text, mode });
}

function renderTaskState() {
  const work = document.getElementById('workStatus');
  const actions = document.getElementById('queueActions');
  const badge = document.getElementById('queueBadge');
  const count = document.getElementById('queueCount');
  work.classList.toggle('active', agentRunning);
  actions.classList.toggle('active', agentRunning && mode === 'agent');
  badge.textContent = 'Queue ' + queuedCount;
  count.textContent = queuedCount ? 'Queue ' + queuedCount : '';
  sndBtn.textContent = agentRunning && mode === 'agent' ? 'Q' : '▲';
}

function addQueuedTask(task, label) {
  hideEmpty();
  const w = document.getElementById('msgs');
  const d = document.createElement('div');
  d.className = 'queued-card';
  d.innerHTML = '<strong>' + escHtml(label) + '</strong><div style="margin-top:3px">' + escHtml(task?.prompt || '') + '</div>';
  w.appendChild(d);
  scrollBot();
}

// ── Message rendering ───────────────────────────────────────────────
let curAgentCard = null;
let curTimeline = null;
let curTermLog = null;
let curFilesList = null;
let curEvents = null;
let curTools = null;
let curPatchSummary = null;
let curServerCard = null;
let agentTimers = [];

function addUserMsg(content) {
  hideEmpty();
  const w = document.getElementById('msgs');
  const d = document.createElement('div'); d.className = 'msg user';
  d.innerHTML = \`<div class="mmeta"><div class="av u">U</div><span>You</span><span class="spacer"></span><button class="copy-mini" data-copy="\${attr(content)}">Copy</button></div><div class="mbody">\${escHtml(content)}</div>\`;
  w.appendChild(d); addTyping(); scrollBot();
}

function addAiMsg(content) {
  removeTyping();
  const w = document.getElementById('msgs');
  const d = document.createElement('div'); d.className = 'msg';
  const body = document.createElement('div'); body.className = 'mbody';
  body.dataset.raw = content || '';
  body.innerHTML = renderMd(content);
  d.innerHTML = \`<div class="mmeta"><div class="av ai">M</div><span>Meldex AI</span><span class="spacer"></span><button class="copy-mini copy-response">Copy</button></div>\`;
  d.appendChild(body); w.appendChild(d); scrollBot();
  return body;
}

function addTyping() {
  removeTyping();
  const w = document.getElementById('msgs');
  const d = document.createElement('div'); d.id = 'typingEl'; d.className = 'msg';
  d.innerHTML = \`<div class="mmeta"><div class="av ai">M</div><span>Meldex AI</span></div><div class="typing"><span></span><span></span><span></span></div>\`;
  w.appendChild(d); scrollBot();
}
function removeTyping() { document.getElementById('typingEl')?.remove(); }

function addErrMsg(msg) {
  const w = document.getElementById('msgs');
  const d = document.createElement('div'); d.className = 'msg';
  d.innerHTML = \`<div class="errmsg"><div class="err-head"><span>Error</span><button class="copy-mini" data-copy="\${attr(msg)}">Copy</button></div><div>\${escHtml(cleanError(msg))}</div><div style="margin-top:4px;color:var(--tx2)">Retry the request or check your connection/settings.</div></div>\`;
  w.appendChild(d); scrollBot();
}

function scrollBot() {
  const m = document.getElementById('msgs'); m.scrollTop = m.scrollHeight;
}
function hideEmpty() {
  document.getElementById('emptyState')?.remove();
}
function makeEmpty() {
  const d = document.createElement('div'); d.id = 'emptyState'; d.className = 'empty';
  d.innerHTML = \`<div class="ei">M</div><div class="et">What are we building?</div><div class="es">Chat about code or ask the agent to make a safe, reviewable change.</div><div class="chips"><div class="chip" data-p="Explain the current file" data-m="chat">Explain file</div><div class="chip" data-p="Fix bugs in the current file" data-m="agent">Fix bugs</div><div class="chip" data-p="Create a landing page with index.html, style.css, script.js, README.md" data-m="agent">Landing page</div></div>\`;
  return d;
}

// ── Agent card ──────────────────────────────────────────────────────
function addAgentCard() {
  hideEmpty(); removeTyping();
  clearAgentTimers();
  const w = document.getElementById('msgs');
  const card = document.createElement('div'); card.className = 'msg';
  card.innerHTML = \`<div class="mmeta"><div class="av ai">M</div><span>Meldex Agent</span></div>\`;
  const body = document.createElement('div'); body.className = 'agent-inline';
  body.innerHTML = \`
    <div class="agent-head"><div class="atitle">Meldex is working...</div><div class="livechip" id="agentLive">working</div></div>
    <div class="fold open" id="thinkingFold">
      <div class="fold-h"><div class="fold-title"><span class="fold-caret">›</span><span>Thinking</span></div><span id="thinkingState" class="delta"></span></div>
      <div class="fold-body"><div id="agTimeline"></div></div>
    </div>
    <div class="fold open" id="toolsFold">
      <div class="fold-h"><div class="fold-title"><span class="fold-caret">›</span><span>Tool activity</span></div></div>
      <div class="fold-body"><div id="agTools" class="tools"></div></div>
    </div>
    <div class="fold" id="eventsFold">
      <div class="fold-h"><div class="fold-title"><span class="fold-caret">›</span><span>Show details</span></div></div>
      <div class="fold-body"><div id="agEvents" class="events"></div></div>
    </div>\`;
  card.appendChild(body);
  w.appendChild(card);
  curAgentCard = body; curTimeline = body.querySelector('#agTimeline'); curEvents = body.querySelector('#agEvents'); curTools = body.querySelector('#agTools'); curTermLog = null; curFilesList = null; curPatchSummary = null;
  body.querySelectorAll('.fold-h').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  agentTimers.push(setTimeout(() => addStatusLine('Still working...', 'neutral'), 10000));
  agentTimers.push(setTimeout(() => addStatusLine('Taking longer than expected. You can continue waiting or retry if needed.', 'neutral'), 30000));
  scrollBot();
}

function updateTimeline(steps) {
  if (!curTimeline) return;
  curTimeline.innerHTML = '';
  const ic = { pending:'', running:'', done:'✓', error:'!' };
  const visible = steps.filter(s => s.status !== 'pending').filter((s, idx, arr) => arr.findIndex(x => x.label === s.label && x.status === s.status) === idx);
  visible.forEach(s => {
    const d = document.createElement('div'); d.className = 'astep';
    const det = s.detail ? \`<div class="adetail">\${escHtml(s.detail)}</div>\` : '';
    d.innerHTML = \`<div class="adot \${s.status}">\${ic[s.status]||''}</div><div class="ainfo"><div class="alabel \${s.status}">\${escHtml(cleanStepLabel(s.label))}</div>\${det}</div>\`;
    curTimeline.appendChild(d);
  });
  const running = steps.find(s => s.status === 'running');
  const failed = steps.find(s => s.status === 'error');
  const state = document.getElementById('thinkingState');
  if (state) state.innerHTML = failed ? '<span class="rem">failed</span>' : running ? '<span class="add">active</span>' : '<span class="add">completed</span>';
  const title = curAgentCard?.querySelector('.atitle');
  if (title) title.textContent = failed ? 'Needs attention' : running ? running.label + '...' : 'Review changes';
  const fold = document.getElementById('thinkingFold');
  if (fold && !running && !failed) fold.classList.remove('open');
  scrollBot();
}

function cleanStepLabel(label) {
  const lower = String(label || '').toLowerCase();
  if (lower.includes('understanding')) return 'Understood request';
  if (lower.includes('reading')) return 'Read workspace';
  if (lower.includes('detect')) return 'Detected project';
  if (lower.includes('inspect')) return 'Inspected files';
  if (lower.includes('planning')) return 'Planned changes';
  if (lower.includes('preparing file') || lower.includes('writing') || lower.includes('edited')) return label.replace('Preparing file edits', 'Prepared file edits').replace('Writing files', 'Edited files');
  if (lower.includes('preview') || lower.includes('diff')) return 'Reviewed changes';
  if (lower.includes('running checks')) return 'Ran checks';
  if (lower.includes('final')) return 'Reviewed result';
  return label;
}

function appendEvent(event) {
  if (!curEvents || !event) return;
  if (isNoisyEvent(event)) return;
  const d = document.createElement('div'); d.className = 'event ' + (event.status || '');
  const dur = typeof event.durationMs === 'number' && event.durationMs >= 500 ? '<br>' + formatDuration(event.durationMs) : '';
  d.innerHTML = \`<div class="eico">\${event.status === 'done' ? '✓' : event.status === 'error' ? '!' : ''}</div><div class="etxt"><div class="evt-title">\${escHtml(event.title || 'Event')}</div><div class="evt-desc">\${escHtml(event.description || '')}</div></div><div class="etime">\${escHtml(event.timestamp || '')}\${dur}</div>\`;
  curEvents.appendChild(d);
  appendToolCard(event);
  scrollBot();
}

function appendToolCard(event) {
  if (!curTools || !event) return;
  if (isNoisyEvent(event)) return;
  const id = 'tool-' + String(event.id || Math.random()).replace(/[^a-z0-9_-]/gi, '-');
  const existing = document.getElementById(id);
  const status = event.status || 'done';
  const html = \`<div class="tool-h"><div class="tool-ico">\${status === 'done' ? '✓' : status === 'error' ? '!' : ''}</div><div class="tool-title">\${escHtml(toolTitle(event.title || 'Activity'))}</div><div class="tool-status">\${statusLabel(status)}</div></div><div class="tool-body">\${escHtml(event.description || '')}<br>\${escHtml(event.timestamp || '')}\${typeof event.durationMs === 'number' && event.durationMs >= 500 ? ' · ' + formatDuration(event.durationMs) : ''}</div>\`;
  if (existing) {
    existing.className = 'tool-card ' + status;
    existing.innerHTML = html;
    return;
  }
  const card = document.createElement('div');
  card.id = id;
  card.className = 'tool-card ' + status;
  card.innerHTML = html;
  card.querySelector('.tool-h').addEventListener('click', () => card.classList.toggle('open'));
  curTools.appendChild(card);
}

function isNoisyEvent(event) {
  const text = ((event.title || '') + ' ' + (event.description || '')).toLowerCase();
  return text.includes('/api/') || text.includes('backend complete') || text.includes('meldex agent cli') || text.includes('1ms');
}

function statusLabel(status) {
  if (status === 'running') return 'Active';
  if (status === 'error') return 'Failed';
  if (status === 'pending') return 'Pending';
  return 'Done';
}

function formatDuration(ms) {
  return ms >= 1000 ? (ms / 1000).toFixed(ms > 9500 ? 0 : 1) + 's' : Math.round(ms) + 'ms';
}

function toolTitle(title) {
  const lower = title.toLowerCase();
  if (lower.includes('workspace')) return 'Read workspace';
  if (lower.includes('context') || lower.includes('inspect')) return 'Inspect files';
  if (lower.includes('plan')) return 'Generate plan';
  if (lower.includes('creating') || lower.includes('editing') || lower.includes('deleting')) return title;
  if (lower.includes('diff')) return 'Prepare diffs';
  if (lower.includes('patch')) return 'Apply patch';
  if (lower.includes('command') || lower.includes('check') || lower.includes('build')) return 'Run command';
  if (lower.includes('summary')) return 'Generate summary';
  return title;
}

function appendTermLog(line, stream) {
  if (!curAgentCard) return;
  if (!curTermLog) {
    const wrap = document.createElement('div'); wrap.className = 'term-wrap';
    wrap.innerHTML = '<div class="term-head"><span>Terminal output</span><button class="copy-mini term-copy">Copy</button></div><div class="termlog"></div>';
    curAgentCard.appendChild(wrap);
    wrap.querySelector('.term-head').addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      wrap.classList.toggle('open');
    });
    curTermLog = wrap.querySelector('.termlog');
  }
  const ln = document.createElement('div');
  ln.style.color = stream === 'stderr' ? 'var(--rd)' : '#abb2bf';
  ln.textContent = line;
  curTermLog.appendChild(ln); curTermLog.scrollTop = curTermLog.scrollHeight;
  scrollBot();
}

function appendTerminalResult(result) {
  if (!curAgentCard || !result) return;
  const d = document.createElement('div'); d.className = 'term-result';
  const passed = Number(result.exitCode) === 0;
  d.innerHTML = \`<strong>\${passed ? 'Build passed' : 'Build failed'}</strong><br><code>\${escHtml(result.command || 'command')}</code>\${typeof result.durationMs === 'number' ? ' · ' + formatDuration(result.durationMs) : ''}</div>\`;
  curAgentCard.appendChild(d);
  scrollBot();
}

function renderServerCard(status) {
  if (!curAgentCard || !status) return;
  const state = status.status || 'idle';
  const url = status.url || '';
  if (!curServerCard) {
    curServerCard = document.createElement('div');
    curServerCard.className = 'server-card';
    curAgentCard.appendChild(curServerCard);
  }
  const logs = (status.logs || []).slice(-40).join('\\n');
  const title = state === 'running' && status.verified ? 'Preview verified' : state === 'running' ? 'Server running' : state === 'starting' ? 'Starting server' : state === 'stopped' ? 'Server stopped' : 'Server issue';
  curServerCard.className = 'server-card ' + (curServerCard.classList.contains('open') ? 'open' : '');
  curServerCard.innerHTML = \`
    <div class="server-head">
      <div class="server-title"><span class="server-dot \${state === 'starting' ? 'starting' : state === 'error' ? 'error' : ''}"></span><span>\${escHtml(title)}</span></div>
      <span class="tool-status">\${escHtml(status.projectKind || '')}</span>
    </div>
    <div class="server-url">\${escHtml(url || status.error || 'No preview URL yet')}</div>
    \${status.verification ? '<div style="font-size:10.5px;color:var(--tx2)">' + escHtml(status.verification) + '</div>' : ''}
    <div class="server-actions">
      <button class="server-btn" data-act="open" \${url ? '' : 'disabled'}>Open</button>
      <button class="server-btn" data-act="stop">Stop</button>
      <button class="server-btn" data-act="copy" \${url ? '' : 'disabled'}>Copy</button>
      <button class="server-btn" data-act="logs">Logs</button>
    </div>
    <div class="server-logs">\${escHtml(logs || status.command || '')}</div>\`;
  curServerCard.querySelector('[data-act="open"]').addEventListener('click', () => {
    if (url) vscode.postMessage({ type: 'openPreview', url });
  });
  curServerCard.querySelector('[data-act="stop"]').addEventListener('click', () => vscode.postMessage({ type: 'stopServer' }));
  curServerCard.querySelector('[data-act="copy"]').addEventListener('click', (event) => {
    if (url) copyText(event.currentTarget, url);
  });
  curServerCard.querySelector('[data-act="logs"]').addEventListener('click', () => curServerCard.classList.toggle('open'));
  if (state === 'running' && url) addStatusLine('Preview ready: ' + url, 'ok');
  scrollBot();
}

function renderPatchPreview(summary, result) {
  if (!curAgentCard) return;
  clearAgentTimers();
  curPatchSummary = summary;
  const title = curAgentCard.querySelector('.atitle');
  if (title) title.textContent = 'Review changes';
  const live = curAgentCard.querySelector('#agentLive');
  if (live) live.textContent = 'review';

  if (summary?.files?.length) {
    pendingFiles = summary.files;
    const fcard = document.createElement('div');
    fcard.id = 'patchCard';
    const changeText = summary.files.map(f => f.path + ' +' + f.added + ' -' + f.removed).join('\\n');
    fcard.innerHTML = \`<div class="changes-head"><div style="font-size:10px;font-weight:600;color:var(--tx2);text-transform:uppercase;letter-spacing:.7px">Changed files</div><div style="display:flex;align-items:center;gap:6px"><button class="copy-mini" data-copy="\${attr(changeText)}">Copy</button><div class="delta"><span class="add">+\${summary.totalAdded}</span> <span class="rem">-\${summary.totalRemoved}</span></div></div></div>\`;
    const list = document.createElement('div'); list.className = 'changed-files';
    summary.files.forEach(f => {
      const r = document.createElement('div'); r.className = 'frow';
      r.innerHTML = \`<span class="fbadge \${f.operation}">\${f.operation[0].toUpperCase()}</span><span class="fname">\${escHtml(f.path)}</span><span class="fdelta"><span class="add">+\${f.added}</span> <span class="rem">-\${f.removed}</span></span>\`;
      r.addEventListener('click', (event) => {
        vscode.postMessage({ type: 'openDiff', patchId: f.id });
      });
      list.appendChild(r);
    });
    fcard.appendChild(list);
    const acts = document.createElement('div'); acts.className = 'apply-row';
    acts.innerHTML = \`<button class="apply-btn yes" id="reviewFirst">Review changes</button><button class="apply-btn yes" id="applyYes">Apply all</button><button class="apply-btn no" id="applyNo">Reject all</button><button class="apply-btn undo" id="undoLast">Undo</button>\`;
    fcard.appendChild(acts);
    fcard.querySelector('#reviewFirst').addEventListener('click', () => {
      const first = summary.files[0];
      if (first) vscode.postMessage({ type: 'openDiff', patchId: first.id });
    });
    curAgentCard.appendChild(fcard);
    fcard.querySelector('#applyYes').addEventListener('click', () => {
      vscode.postMessage({ type: 'applyAll' });
      acts.innerHTML = \`<span style="grid-column:1/-1;font-size:11px;color:var(--tx2)">Applying patches and running checks...</span>\`;
    });
    fcard.querySelector('#applyNo').addEventListener('click', () => {
      vscode.postMessage({ type: 'rejectAll' });
      pendingFiles = []; acts.innerHTML = \`<span style="grid-column:1/-1;font-size:11px;color:var(--tx2)">Rejected</span>\`;
    });
    fcard.querySelector('#undoLast').addEventListener('click', () => vscode.postMessage({ type: 'undoLastPatch' }));
  }

  if (result.summary) {
    const s = document.createElement('div'); s.className = 'summary-ok';
    s.innerHTML = \`<button class="copy-mini" data-copy="\${attr(result.summary)}">Copy</button>\`;
    curAgentCard.appendChild(s);
    const textNode = document.createElement('div');
    s.appendChild(textNode);
    revealText(textNode, result.summary);
  }
  scrollBot();
}

function handleAgentResult(result, applied) {
  if (!curAgentCard) return;
  clearAgentTimers();
  const title = curAgentCard.querySelector('.atitle');
  if (title) title.textContent = '✓ Done';
  const live = curAgentCard.querySelector('#agentLive');
  if (live) live.textContent = 'done';
  if (result?.summary) addStatusLine(result.summary, 'ok');
  scrollBot();
}

function markPatchApplied(applied, errors) {
  if (errors?.length) addStatusLine('Some files failed: ' + errors.join(', '), 'error');
  else addStatusLine('Applied ' + applied.length + ' file(s). Running checks if needed…', 'ok');
}

function markPatchRejected(rejected) {
  addStatusLine('Rejected ' + rejected.length + ' pending change(s).', 'neutral');
}

function addStatusLine(text, tone) {
  if (!curAgentCard) { addErrMsg(text); return; }
  const s = document.createElement('div');
  s.className = tone === 'error' ? 'errmsg' : 'summary-ok';
  s.innerHTML = tone === 'error'
    ? \`<div class="err-head"><span>Error</span><button class="copy-mini" data-copy="\${attr(text)}">Copy</button></div><div>\${escHtml(cleanError(text))}</div>\`
    : \`<div>\${escHtml(text)}</div>\`;
  curAgentCard.appendChild(s);
  scrollBot();
}

function addAgentError(msg, retryable) {
  clearAgentTimers();
  if (!curAgentCard) { addErrMsg(msg); return; }
  const e = document.createElement('div'); e.className = 'errmsg';
  e.innerHTML = \`<div class="err-head"><span>Agent error</span><button class="copy-mini" data-copy="\${attr(msg)}">Copy</button></div><div>\${escHtml(cleanError(msg))}</div><div style="margin-top:4px;color:var(--tx2)">You can retry the task.</div>\`;
  curAgentCard.appendChild(e);
  if (retryable) {
    const rb = document.createElement('button'); rb.className = 'retry-btn'; rb.textContent = 'Retry agent';
    rb.addEventListener('click', () => { rb.remove(); vscode.postMessage({ type: 'retryAgent' }); });
    curAgentCard.appendChild(rb);
  }
  scrollBot();
}

function revealText(el, text, speed) {
  const chars = String(text || '').split('');
  let i = 0;
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  el.textContent = '';
  el.appendChild(cursor);
  const tick = () => {
    if (i >= chars.length) { cursor.remove(); return; }
    cursor.before(document.createTextNode(chars[i++]));
    scrollBot();
    setTimeout(tick, speed || 6);
  };
  tick();
}

function clearAgentTimers() {
  agentTimers.forEach(t => clearTimeout(t));
  agentTimers = [];
}

// ── Markdown ────────────────────────────────────────────────────────
function renderMd(text) {
  if (!text) return '';
  let h = escHtml(text);
  const B = String.fromCharCode(96);
  h = h.replace(new RegExp(B+B+B+'(\\w*)\\n([\\s\\S]*?)'+B+B+B,'g'), (_,lang,code) => {
    const id = 'c'+Math.random().toString(36).slice(2,6);
    return \`<div class="cwrap"><div class="chdr"><span>\${lang||'code'}</span><button class="ccopy" data-copy-code="\${id}">Copy</button></div><pre><code id="\${id}">\${code.trim()}</code></pre></div>\`;
  });
  h = h.replace(new RegExp(B+'([^'+B+'\\n]+)'+B,'g'),'<code>$1</code>');
  h = h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
  h = h.replace(/\\*(.+?)\\*/g,'<em>$1</em>');
  h = h.replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>');
  h = h.replace(/^- (.+)$/gm,'<li>$1</li>');
  h = h.replace(/(<li>.*<\\/li>)/gs, m => m.startsWith('<ul>') ? m : '<ul>'+m+'</ul>');
  h = h.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2" target="_blank">$1</a>');
  h = h.split('\\n\\n').map(p => { p=p.trim(); return (!p||p.startsWith('<')) ? p : '<p>'+p.replace(/\\n/g,'<br>')+'</p>'; }).join('');
  return h;
}
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function attr(t) {
  return escHtml(String(t)).replace(/'/g,'&#39;');
}
function cleanError(msg) {
  return String(msg || '').replace(/^(Error:\\s*)+/,'').split('\\n').slice(0,5).join('\\n');
}
function copyText(btn, text) {
  navigator.clipboard.writeText(text || '').then(()=>{
    const old = btn.textContent;
    btn.textContent='Copied';
    btn.classList.add('ok');
    setTimeout(()=>{btn.textContent=old || 'Copy';btn.classList.remove('ok');},1400);
  });
}
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
