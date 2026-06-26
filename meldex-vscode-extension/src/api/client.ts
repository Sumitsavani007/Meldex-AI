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
  files?: { operation: "create" | "edit" | "update" | "delete"; path: string; content?: string; description: string }[];
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
  expiresAt?: string | null;
  tokenId?: string;
}

export interface ExtensionHealth {
  ok: boolean;
  user: MeldexUser;
  backend: "ok";
  model: {
    provider: string;
    model: string;
    status: "ok" | "rate_limited" | "offline" | "not_configured" | "error";
  };
  extensionApi: "ok";
}

export interface ModelHealth {
  provider: string;
  model: string;
  status: string;
  healthy: boolean;
  message: string;
  retryAfter: string | null;
}

export interface DeviceConnectStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
}

export interface DeviceConnectPoll {
  status: "pending" | "approved" | "expired" | "consumed" | "not_found";
  token?: string;
}

export class MeldexApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "MeldexApiError";
  }
}

const TOKEN_KEY = "meldex.apiToken";
const DEFAULT_API_URL = "https://meldex.newsyfly.com";

export class MeldexApiClient {
  private token: string | null = null;
  private authInvalidHandler: ((message: string) => void) | null = null;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  onAuthInvalid(handler: (message: string) => void): void {
    this.authInvalidHandler = handler;
  }

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

  async getToken(): Promise<string | null> {
    if (this.token) return this.token;
    this.token = (await this.secrets.get(TOKEN_KEY)) ?? null;
    return this.token;
  }

  async verifyToken(raw: string): Promise<MeldexUser> {
    return this.request<MeldexUser>(`${this.getApiUrl()}/api/extensions/me`, "GET", undefined, raw);
  }

  async currentUser(raw?: string): Promise<MeldexUser> {
    if (!raw && !this.token) throw new MeldexApiError("Not connected", 401, "token_invalid");
    return this.request<MeldexUser>(`${this.getApiUrl()}/api/extensions/me`, "GET", undefined, raw);
  }

  async modelHealth(raw?: string): Promise<ModelHealth> {
    if (!raw && !this.token) throw new MeldexApiError("Not connected", 401, "token_invalid");
    return this.request<ModelHealth>(`${this.getApiUrl()}/api/extensions/model-health`, "GET", undefined, raw);
  }

  async startGoogleConnect(): Promise<DeviceConnectStart> {
    return this.request<DeviceConnectStart>(`${this.getApiUrl()}/api/extensions/connect/start`, "POST");
  }

  async pollGoogleConnect(deviceCode: string): Promise<DeviceConnectPoll> {
    return this.request<DeviceConnectPoll>(
      `${this.getApiUrl()}/api/extensions/connect/poll?deviceCode=${encodeURIComponent(deviceCode)}`,
      "GET"
    );
  }

  async revokeCurrentToken(): Promise<void> {
    const me = await this.currentUser();
    const tokenId = (me as MeldexUser & { tokenId?: string }).tokenId;
    if (!tokenId) return;
    await this.request<{ success: boolean }>(`${this.getApiUrl()}/api/account/tokens/${encodeURIComponent(tokenId)}`, "DELETE");
  }

  async health(raw?: string): Promise<ExtensionHealth> {
    if (!raw && !this.token) throw new MeldexApiError("Not connected", 401, "token_invalid");
    return this.request<ExtensionHealth>(`${this.getApiUrl()}/api/extensions/health`, "GET", undefined, raw);
  }

  async chat(messages: ChatMessage[], ctx?: WorkspaceCtx, onChunk?: (t: string) => void): Promise<string> {
    if (!this.token) throw new Error("Not connected");
    const result = await this.request<{ message: string }>(
      `${this.getApiUrl()}/api/extensions/chat`, "POST", { messages, context: ctx }
    );
    if (onChunk) {
      for (const char of result.message) { onChunk(char); await new Promise(r => setTimeout(r, 3)); }
    }
    return result.message;
  }

  async runAgent(task: string, ctx?: WorkspaceCtx): Promise<AgentResult> {
    if (!this.token) throw new Error("Not connected");
    return this.request<AgentResult>(`${this.getApiUrl()}/api/extensions/agent`, "POST", { task, context: ctx });
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
        "User-Agent": "MeldexAI-VSCode/5.1.2",
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
              const errorJson = json as { error?: string; code?: string };
              const message = errorJson.error ?? `HTTP ${res.statusCode}`;
              const code = errorJson.code;
              if (res.statusCode === 401 && ["token_revoked", "token_expired", "token_invalid"].includes(code || "")) {
                void this.clearToken();
                this.authInvalidHandler?.(code === "token_revoked" ? "Token revoked. Please login again." : code === "token_expired" ? "Token expired. Please login again." : "Token invalid. Please login again.");
              }
              reject(new MeldexApiError(message, res.statusCode, code));
            } else { resolve(json); }
          } catch { reject(new MeldexApiError(`Server error (${res.statusCode}): ${data.slice(0, 150)}`, res.statusCode)); }
        });
      });
      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNREFUSED") reject(new MeldexApiError(`Cannot reach server. Is Meldex running at ${this.getApiUrl()}?`, undefined, "offline"));
        else if (err.code === "ENOTFOUND") reject(new MeldexApiError(`Cannot resolve ${parsed.hostname}. Check your network.`, undefined, "offline"));
        else reject(new MeldexApiError(err.message, undefined, err.code));
      });
      req.setTimeout(120000, () => { req.destroy(new MeldexApiError("Request timed out (120s)", undefined, "offline")); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
