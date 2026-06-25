import * as https from "https";
import * as http from "http";
import * as vscode from "vscode";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface WorkspaceCtx {
  projectType?: string;
  packageManager?: string;
  workspaceName?: string;
  activeFile?: string;
  activeFileContent?: string;
  selectedText?: string;
  projectFiles?: string[];
  terminalError?: string;
  packageJson?: string;
}

export interface AgentResult {
  plan?: string[];
  files?: { operation: "create" | "edit" | "delete"; path: string; content: string; description: string }[];
  commands?: string[];
  summary?: string;
  warnings?: string[];
  error?: string;
}

export interface MeldexUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const TOKEN_KEY = "meldex.apiToken";
const DEFAULT_API_URL = "https://meldex.newsyfly.com";

export class MeldexApiClient {
  private token: string | null = null;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  getApiUrl(): string {
    return (vscode.workspace.getConfiguration("meldex").get<string>("apiUrl") ?? DEFAULT_API_URL).replace(/\/+$/, "");
  }

  async loadToken(): Promise<boolean> {
    this.token = (await this.secrets.get(TOKEN_KEY)) ?? null;
    return !!this.token;
  }

  async saveToken(token: string): Promise<void> {
    this.token = token;
    await this.secrets.store(TOKEN_KEY, token);
  }

  async clearToken(): Promise<void> {
    this.token = null;
    await this.secrets.delete(TOKEN_KEY);
  }

  isAuthenticated(): boolean { return !!this.token; }

  async verifyToken(raw: string): Promise<MeldexUser> {
    return this.request<MeldexUser>(`${this.getApiUrl()}/api/extensions/me`, "GET", undefined, raw);
  }

  async chat(messages: ChatMessage[], ctx?: WorkspaceCtx, onChunk?: (t: string) => void): Promise<string> {
    if (!this.token) throw new Error("Not connected");
    const model = vscode.workspace.getConfiguration("meldex").get<string>("defaultModel");
    const result = await this.request<{ message: string }>(
      `${this.getApiUrl()}/api/extensions/chat`, "POST", { messages, model, context: ctx }
    );
    if (onChunk) {
      for (const char of result.message) { onChunk(char); await new Promise(r => setTimeout(r, 3)); }
    }
    return result.message;
  }

  async runAgent(task: string, ctx?: WorkspaceCtx): Promise<AgentResult> {
    if (!this.token) throw new Error("Not connected");
    const model = vscode.workspace.getConfiguration("meldex").get<string>("defaultModel");
    return this.request<AgentResult>(`${this.getApiUrl()}/api/extensions/agent`, "POST", { task, model, context: ctx });
  }

  async loginWithEmail(email: string, password: string): Promise<MeldexUser> {
    const result = await this.request<{ token: string; user: MeldexUser }>(
      `${this.getApiUrl()}/api/extensions/auth`, "POST", { email, password }
    );
    await this.saveToken(result.token);
    return result.user;
  }

  private request<T>(url: string, method: string, body?: unknown, overrideToken?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const bodyStr = body ? JSON.stringify(body) : "";
      const tok = overrideToken ?? this.token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "MeldexAI-VSCode/4.0.0",
      };
      if (bodyStr) headers["Content-Length"] = Buffer.byteLength(bodyStr).toString();
      if (tok) headers["Authorization"] = `Bearer ${tok}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
      };
      const transport = isHttps ? https : http;
      const req = transport.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const json = JSON.parse(data) as T & { error?: string };
            if ((res.statusCode ?? 0) >= 400) {
              reject(new Error((json as { error?: string }).error ?? `HTTP ${res.statusCode}`));
            } else { resolve(json); }
          } catch { reject(new Error(`Server error (${res.statusCode}): ${data.slice(0, 150)}`)); }
        });
      });
      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNREFUSED") reject(new Error(`Cannot reach server. Is Meldex running at ${this.getApiUrl()}?`));
        else if (err.code === "ENOTFOUND") reject(new Error(`Cannot resolve ${parsed.hostname}. Check your network.`));
        else reject(err);
      });
      req.setTimeout(20000, () => { req.destroy(new Error("Request timed out (20s)")); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
