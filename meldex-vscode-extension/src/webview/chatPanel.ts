import * as vscode from "vscode";
import * as path from "path";
import { MeldexApiClient, ChatMessage, MeldexUser, WorkspaceCtx } from "../api/client";
import { WorkspaceContext } from "../context/workspace";
import { AgentRunner, AgentStep } from "../agent/agentRunner";
import { AgentResult } from "../api/client";

export class MeldexChatProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private client: MeldexApiClient;
  private history: ChatMessage[] = [];
  private user: MeldexUser | null = null;
  private _lastTask = "";

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.client = new MeldexApiClient(ctx.secrets);
    this.client.loadToken().then(ok => {
      if (ok) this.verifyAndInit();
    });
  }

  private async verifyAndInit() {
    try {
      const token = await this.ctx.secrets.get("meldex.apiToken");
      if (!token) return;
      this.user = await this.client.verifyToken(token);
      this.post({ type: "connected", user: this.user });
    } catch {
      await this.client.clearToken();
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
      url?: string;
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
            const user = await this.client.verifyToken(raw);
            await this.client.saveToken(raw);
            this.user = user;
            this.post({ type: "connected", user });
          } catch (e) {
            this.post({ type: "connectError", message: e instanceof Error ? e.message : "Connection failed" });
          }
          break;
        }

        case "loginWithEmail": {
          const { email, password } = msg as unknown as { type: string; email: string; password: string };
          if (!email || !password) { this.post({ type: "connectError", message: "Enter email and password" }); return; }
          this.post({ type: "connecting" });
          try {
            const user = await this.client.loginWithEmail(email, password);
            this.user = user;
            this.post({ type: "connected", user });
          } catch (e) {
            this.post({ type: "connectError", message: e instanceof Error ? e.message : "Login failed" });
          }
          break;
        }

        case "disconnect": {
          await this.client.clearToken();
          this.user = null;
          this.history = [];
          this.post({ type: "disconnected" });
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
            this.post({ type: "agentStart" });
            await this.runAgent(content);
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
            this.post({ type: "error", message: e instanceof Error ? e.message : "Chat failed" });
          }
          break;
        }

        case "clearChat": {
          this.history = [];
          this.post({ type: "chatCleared" });
          break;
        }

        case "applyFiles": {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (root && Array.isArray(msg.files)) {
            const { applied, errors } = await WorkspaceContext.applyFileChanges(root, msg.files);
            this.post({ type: "filesApplied", applied, errors });
          }
          break;
        }

        case "retryAgent": {
          if (this._lastTask) {
            this.post({ type: "agentStart" });
            await this.runAgent(this._lastTask);
          }
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
    const runner = new AgentRunner(
      this.client,
      (steps: AgentStep[]) => this.post({ type: "agentSteps", steps }),
      (result: AgentResult, applied: string[]) => this.post({ type: "agentResult", result, applied }),
      (message: string, retryable?: boolean) => this.post({ type: "agentError", message, retryable: !!retryable }),
      (line: string, stream: "stdout" | "stderr") => this.post({ type: "cmdOutput", line, stream })
    );
    await runner.run(task);
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
  --bg:#0a0a12;--sur:#101020;--sur2:#181830;--sur3:#20203a;
  --bdr:rgba(255,255,255,0.07);--bdr2:rgba(255,255,255,0.13);
  --tx:#e4e4f0;--tx2:#6060a0;--tx3:#303060;
  --am:#f59e0b;--am2:#fbbf24;--amd:rgba(245,158,11,0.13);
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
.bmark{width:21px;height:21px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#000;box-shadow:0 2px 8px rgba(245,158,11,0.3)}
.bname{font-size:13px;font-weight:700;color:var(--tx)}
.hdot{width:6px;height:6px;border-radius:50%;background:var(--tx3);transition:all .3s}
.hdot.on{background:var(--gr);box-shadow:0 0 6px rgba(16,185,129,0.5)}
.hdot.err{background:var(--rd)}
.hdr-r{display:flex;align-items:center;gap:5px}
.upill{font-size:10px;color:var(--tx2);background:var(--sur2);border:1px solid var(--bdr);padding:2px 8px;border-radius:20px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ibtn{background:transparent;border:none;color:var(--tx2);cursor:pointer;padding:4px;border-radius:4px;font-size:13px;line-height:1;transition:color .15s,background .15s;display:flex;align-items:center;justify-content:center}
.ibtn:hover{color:var(--tx);background:var(--sur2)}

/* Screens */
.screen{display:none;flex-direction:column;flex:1;overflow:hidden}
.screen.active{display:flex}

/* ── Login screen ── */
.login-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;gap:14px}
.login-logo{width:52px;height:52px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#000;box-shadow:0 8px 24px rgba(245,158,11,0.25)}
.login-title{font-size:16px;font-weight:700;text-align:center;color:var(--tx)}
.login-sub{font-size:12px;color:var(--tx2);text-align:center;line-height:1.5}
.inp{width:100%;background:var(--sur2);border:1px solid var(--bdr2);border-radius:var(--r);padding:10px 13px;color:var(--tx);font-size:13px;font-family:var(--font);outline:none;transition:border-color .15s,box-shadow .15s}
.inp:focus{border-color:var(--am);box-shadow:0 0 0 3px var(--amd)}
.inp::placeholder{color:var(--tx2)}
.login-fields{width:100%;display:flex;flex-direction:column;gap:9px}
.btn-login{width:100%;padding:10px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;border:none;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s;margin-top:2px}
.btn-login:hover{opacity:.9}
.btn-login:disabled{opacity:.45;cursor:not-allowed}
.login-err{font-size:11.5px;color:var(--rd);text-align:center;padding:8px 11px;background:var(--rdd);border:1px solid rgba(239,68,68,0.2);border-radius:var(--rs)}

/* ── Chat screen ── */
.msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}
.msgs::-webkit-scrollbar{width:3px}
.msgs::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px}
.msg{animation:fadeup .18s ease}
@keyframes fadeup{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.mmeta{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--tx2);margin-bottom:3px}
.av{width:16px;height:16px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0}
.av.u{background:var(--vl);color:#fff}.av.ai{background:linear-gradient(135deg,#f59e0b,#d97706);color:#000}
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

/* Agent inline */
.agent-inline{background:var(--sur);border:1px solid var(--bdr);border-radius:var(--r);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.atitle{font-size:10px;font-weight:600;color:var(--tx2);text-transform:uppercase;letter-spacing:.7px}
.astep{display:flex;align-items:flex-start;gap:8px;position:relative;padding:3px 0}
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
.termlog{background:#040409;border:1px solid var(--bdr);border-radius:var(--rs);padding:7px 9px;max-height:130px;overflow-y:auto;font-family:var(--mono);font-size:10.5px;line-height:1.6}
.termlog::-webkit-scrollbar{width:3px}.termlog::-webkit-scrollbar-thumb{background:var(--bdr2)}
.changed-files{display:flex;flex-direction:column;gap:1px}
.frow{display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid var(--bdr)}
.frow:last-child{border-bottom:none}
.fbadge{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0}
.fbadge.create{background:var(--grd);color:var(--gr)}.fbadge.edit{background:rgba(59,130,246,0.1);color:var(--bl)}.fbadge.delete{background:var(--rdd);color:var(--rd)}
.fname{font-size:11px;font-family:var(--mono);color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apply-row{display:flex;gap:6px;margin-top:4px}
.apply-btn{flex:1;padding:6px;font-size:11px;font-weight:600;cursor:pointer;border-radius:var(--rs);border:none;transition:opacity .15s}
.apply-btn:hover{opacity:.85}
.apply-btn.yes{background:var(--am);color:#000}.apply-btn.no{background:var(--sur2);border:1px solid var(--bdr2);color:var(--tx2)}
.summary-ok{background:var(--grd);border:1px solid rgba(16,185,129,0.2);color:rgba(255,255,255,0.85);padding:8px 11px;border-radius:var(--r);font-size:12px}
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
.fpill{font-size:10px;color:var(--tx2);background:var(--sur2);border:1px solid var(--bdr);padding:1px 7px;border-radius:20px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clrbtn{margin-left:auto;background:transparent;border:none;color:var(--tx2);font-size:10px;cursor:pointer;padding:2px 5px;border-radius:3px;transition:color .15s}
.clrbtn:hover{color:var(--tx)}

/* Footer */
.footer{padding:5px 11px;background:var(--sur);border-top:1px solid var(--bdr);font-size:10px;color:var(--tx2);display:flex;align-items:center;gap:5px;flex-shrink:0}
.fdot{width:5px;height:5px;border-radius:50%;background:var(--tx3);flex-shrink:0}
.fdot.on{background:var(--gr)}

/* Empty state */
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;text-align:center}
.ei{font-size:22px;opacity:.4}.et{font-size:12px;font-weight:600;color:var(--tx2)}.es{font-size:11px;color:var(--tx3);line-height:1.55}
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
    <button class="ibtn" id="disconnBtn" title="Disconnect" style="display:none">⏏</button>
  </div>
</div>

<!-- ── Login screen ─────────────────────────────────────────────── -->
<div id="connScreen" class="screen">
  <div class="login-wrap">
    <div class="login-logo">M</div>
    <div class="login-title">Connect Meldex AI</div>
    <div class="login-sub">Sign in to start coding with AI inside VS Code</div>
    <div class="login-fields">
      <input id="emailInput" class="inp" type="email" placeholder="Email address" autocomplete="email" spellcheck="false"/>
      <input id="passwordInput" class="inp" type="password" placeholder="Password" autocomplete="current-password"/>
      <div id="loginErr" class="login-err" style="display:none"></div>
      <button id="loginBtn" class="btn-login">Sign In</button>
    </div>
  </div>
</div>

<!-- ── Chat screen ────────────────────────────────────────────────── -->
<div id="chatScreen" class="screen" style="flex-direction:column">
  <div class="msgs" id="msgs">
    <div class="empty" id="emptyState">
      <div class="ei">✨</div>
      <div class="et">Meldex AI is ready</div>
      <div class="es">Ask anything about your code,<br>or use Agent to build features.</div>
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
    <div class="mrow">
      <button class="mpill active" data-mode="chat">💬 Chat</button>
      <button class="mpill" data-mode="agent">⚡ Agent</button>
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

// ── Messages from extension ─────────────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  switch(m.type) {
    case 'init':
      if (m.connected && m.user) showChat(m.user);
      else showConnect();
      break;
    case 'connecting':
      document.getElementById('loginBtn').disabled = true;
      document.getElementById('loginBtn').textContent = 'Signing in…';
      document.getElementById('loginErr').style.display = 'none';
      break;
    case 'connected':
      showChat(m.user);
      break;
    case 'connectError':
      document.getElementById('loginBtn').disabled = false;
      document.getElementById('loginBtn').textContent = 'Sign In';
      const errEl = document.getElementById('loginErr');
      errEl.textContent = m.message || 'Sign in failed';
      errEl.style.display = 'block';
      setDot(false);
      break;
    case 'disconnected':
      showConnect();
      break;
    case 'userMessage': addUserMsg(m.content); break;
    case 'assistantStart': curAiEl = addAiMsg(''); curContent = ''; break;
    case 'chunk':
      curContent += m.chunk;
      if (curAiEl) { curAiEl.innerHTML = renderMd(curContent); scrollBot(); }
      break;
    case 'assistantDone': curAiEl = null; removeTyping(); break;
    case 'agentStart':
      addAgentCard();
      break;
    case 'agentSteps': updateTimeline(m.steps); break;
    case 'agentResult': handleAgentResult(m.result, m.applied); break;
    case 'agentError':
      lastRetryable = m.retryable;
      addAgentError(m.message, m.retryable);
      break;
    case 'cmdOutput': appendTermLog(m.line, m.stream); break;
    case 'filesApplied':
      if (m.errors?.length) addErrMsg('Some files failed: ' + m.errors.join(', '));
      break;
    case 'error': removeTyping(); addErrMsg(m.message); break;
    case 'chatCleared':
      document.getElementById('msgs').innerHTML = '';
      document.getElementById('msgs').appendChild(makeEmpty());
      break;
    case 'contextUpdate':
      if (m.file) {
        const p = document.getElementById('fpill');
        p.textContent = '📄 ' + m.file;
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
  document.getElementById('loginBtn').disabled = false;
  document.getElementById('loginBtn').textContent = 'Sign In';
  document.getElementById('loginErr').style.display = 'none';
  document.getElementById('emailInput').value = '';
  document.getElementById('passwordInput').value = '';
  setDot(false);
  setFooter(false, '');
}

function showChat(user) {
  document.getElementById('connScreen').classList.remove('active');
  document.getElementById('chatScreen').classList.add('active');
  const name = user?.name || user?.email?.split('@')[0] || 'User';
  document.getElementById('upill').textContent = name;
  document.getElementById('upill').style.display = 'inline';
  document.getElementById('disconnBtn').style.display = 'flex';
  setDot(true);
  setFooter(true, name + ' · meldex.newsyfly.com');
}

function setDot(on) {
  const d = document.getElementById('hdot');
  d.className = 'hdot ' + (on ? 'on' : '');
  const fd = document.getElementById('fdot');
  fd.className = 'fdot ' + (on ? 'on' : '');
}
function setFooter(on, text) {
  document.getElementById('ftext').textContent = on ? '🟢 ' + text : 'Not connected';
}

// ── Login events ────────────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('emailInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('passwordInput').focus();
});
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});
document.getElementById('disconnBtn').addEventListener('click', () => {
  if (confirm('Sign out from Meldex AI?')) vscode.postMessage({ type: 'disconnect' });
});

function doLogin() {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  if (!email || !password) {
    const e = document.getElementById('loginErr');
    e.textContent = 'Please enter email and password';
    e.style.display = 'block';
    return;
  }
  vscode.postMessage({ type: 'loginWithEmail', email, password });
}

// ── Mode ────────────────────────────────────────────────────────────
document.querySelectorAll('.mpill').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mpill').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  document.getElementById('chatIn').placeholder = m === 'agent' ? 'Describe what to build or fix…' : 'Ask anything…';
}

// ── Chips ───────────────────────────────────────────────────────────
document.addEventListener('click', e => {
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

function send() {
  const text = chatIn.value.trim();
  if (!text) return;
  chatIn.value = ''; chatIn.style.height = 'auto'; sndBtn.disabled = true;
  if (mode !== 'agent') addTyping();
  vscode.postMessage({ type: 'chat', message: text, mode });
}

// ── Message rendering ───────────────────────────────────────────────
let curAgentCard = null;
let curTimeline = null;
let curTermLog = null;
let curFilesList = null;

function addUserMsg(content) {
  hideEmpty();
  const w = document.getElementById('msgs');
  const d = document.createElement('div'); d.className = 'msg user';
  d.innerHTML = \`<div class="mmeta"><div class="av u">U</div><span>You</span></div><div class="mbody">\${escHtml(content)}</div>\`;
  w.appendChild(d); addTyping(); scrollBot();
}

function addAiMsg(content) {
  removeTyping();
  const w = document.getElementById('msgs');
  const d = document.createElement('div'); d.className = 'msg';
  const body = document.createElement('div'); body.className = 'mbody';
  body.innerHTML = renderMd(content);
  d.innerHTML = \`<div class="mmeta"><div class="av ai">M</div><span>Meldex AI</span></div>\`;
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
  d.innerHTML = \`<div class="errmsg">⚠ \${escHtml(msg)}</div>\`;
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
  d.innerHTML = \`<div class="ei">✨</div><div class="et">Meldex AI is ready</div><div class="es">Ask anything about your code,<br>or use Agent to build features.</div><div class="chips"><div class="chip" data-p="Explain the current file" data-m="chat">Explain file</div><div class="chip" data-p="Fix bugs in the current file" data-m="agent">Fix bugs</div><div class="chip" data-p="Create a landing page with index.html, style.css, script.js, README.md" data-m="agent">Landing page</div></div>\`;
  return d;
}

// ── Agent card ──────────────────────────────────────────────────────
function addAgentCard() {
  hideEmpty(); removeTyping();
  const w = document.getElementById('msgs');
  const card = document.createElement('div'); card.className = 'msg';
  card.innerHTML = \`<div class="mmeta"><div class="av ai">M</div><span>Meldex Agent</span></div>\`;
  const body = document.createElement('div'); body.className = 'agent-inline';
  body.innerHTML = \`<div class="atitle">Running…</div><div id="agTimeline"></div>\`;
  card.appendChild(body);
  w.appendChild(card);
  curAgentCard = body; curTimeline = body.querySelector('#agTimeline'); curTermLog = null; curFilesList = null;
  scrollBot();
}

function updateTimeline(steps) {
  if (!curTimeline) return;
  curTimeline.innerHTML = '';
  const ic = { pending:'○', running:'◉', done:'✓', error:'✗' };
  steps.forEach(s => {
    const d = document.createElement('div'); d.className = 'astep';
    const det = s.detail ? \`<div class="adetail">\${escHtml(s.detail)}</div>\` : '';
    d.innerHTML = \`<div class="adot \${s.status}">\${ic[s.status]||'○'}</div><div class="ainfo"><div class="alabel \${s.status}">\${s.label}</div>\${det}</div>\`;
    curTimeline.appendChild(d);
  });
  scrollBot();
}

function appendTermLog(line, stream) {
  if (!curAgentCard) return;
  if (!curTermLog) {
    curTermLog = document.createElement('div'); curTermLog.className = 'termlog';
    curAgentCard.appendChild(curTermLog);
  }
  const ln = document.createElement('div');
  ln.style.color = stream === 'stderr' ? 'var(--rd)' : '#abb2bf';
  ln.textContent = line;
  curTermLog.appendChild(ln); curTermLog.scrollTop = curTermLog.scrollHeight;
  scrollBot();
}

function handleAgentResult(result, applied) {
  if (!curAgentCard) return;
  const title = curAgentCard.querySelector('.atitle');
  if (title) title.textContent = '✓ Done';

  if (result.files?.length) {
    pendingFiles = result.files;
    const fcard = document.createElement('div');
    fcard.innerHTML = \`<div style="font-size:10px;font-weight:600;color:var(--tx2);text-transform:uppercase;letter-spacing:.7px;margin:6px 0 4px">Changed Files</div>\`;
    const list = document.createElement('div'); list.className = 'changed-files';
    result.files.forEach(f => {
      const r = document.createElement('div'); r.className = 'frow';
      r.innerHTML = \`<span class="fbadge \${f.operation}">\${f.operation[0].toUpperCase()}</span><span class="fname">\${escHtml(f.path)}</span>\`;
      list.appendChild(r);
    });
    fcard.appendChild(list);
    const acts = document.createElement('div'); acts.className = 'apply-row';
    acts.innerHTML = \`<button class="apply-btn yes" id="applyYes">✓ Apply All</button><button class="apply-btn no" id="applyNo">✕ Reject</button>\`;
    fcard.appendChild(acts);
    curAgentCard.appendChild(fcard);
    fcard.querySelector('#applyYes').addEventListener('click', () => {
      vscode.postMessage({ type: 'applyFiles', files: pendingFiles });
      acts.innerHTML = \`<span style="font-size:11px;color:var(--gr)">✓ Applied \${pendingFiles.length} file(s)</span>\`;
    });
    fcard.querySelector('#applyNo').addEventListener('click', () => {
      pendingFiles = []; acts.innerHTML = \`<span style="font-size:11px;color:var(--tx2)">Rejected</span>\`;
    });
  }

  if (result.summary) {
    const s = document.createElement('div'); s.className = 'summary-ok';
    s.textContent = result.summary;
    curAgentCard.appendChild(s);
  }
  scrollBot();
}

function addAgentError(msg, retryable) {
  if (!curAgentCard) { addErrMsg(msg); return; }
  const e = document.createElement('div'); e.className = 'errmsg'; e.textContent = '⚠ ' + msg;
  curAgentCard.appendChild(e);
  if (retryable) {
    const rb = document.createElement('button'); rb.className = 'retry-btn'; rb.textContent = '↺ Retry Agent';
    rb.addEventListener('click', () => { rb.remove(); vscode.postMessage({ type: 'retryAgent' }); });
    curAgentCard.appendChild(rb);
  }
  scrollBot();
}

// ── Markdown ────────────────────────────────────────────────────────
function renderMd(text) {
  if (!text) return '';
  let h = escHtml(text);
  const B = String.fromCharCode(96);
  h = h.replace(new RegExp(B+B+B+'(\\w*)\\n([\\s\\S]*?)'+B+B+B,'g'), (_,lang,code) => {
    const id = 'c'+Math.random().toString(36).slice(2,6);
    return \`<div class="cwrap"><div class="chdr"><span>\${lang||'code'}</span><button class="ccopy" onclick="cp(this,'\${id}')">Copy</button></div><pre><code id="\${id}">\${code.trim()}</code></pre></div>\`;
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
function cp(btn, id) {
  const code = document.getElementById(id)?.textContent||'';
  navigator.clipboard.writeText(code).then(()=>{ btn.textContent='✓'; btn.classList.add('ok'); setTimeout(()=>{btn.textContent='Copy';btn.classList.remove('ok');},2000); });
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
