"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Trash2, Terminal, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface TokenRecord {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState("VS Code Extension");

  async function loadTokens() {
    try {
      const res = await fetch("/api/extensions/tokens");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch {
      setError("Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTokens(); }, []);

  async function createToken() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/extensions/tokens/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewToken(data.token);
      await loadTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    if (!confirm("Revoke this token? Any extension using it will be disconnected.")) return;
    try {
      await fetch(`/api/extensions/tokens/${id}`, { method: "DELETE" });
      setTokens(prev => prev.filter(t => t.id !== id));
    } catch {
      setError("Failed to revoke token");
    }
  }

  function copyToken() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-amber-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">API Tokens</h1>
        </div>
        <p className="text-sm text-zinc-400">
          Generate tokens to connect the Meldex VS Code extension to your account.
          Each token is shown <strong className="text-white">once</strong> — copy and save it immediately.
        </p>
      </div>

      {/* New token reveal */}
      {newToken && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-emerald-300">Token created — copy it now</span>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 break-all select-all">
              {newToken}
            </code>
            <button
              onClick={copyToken}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors flex-shrink-0"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Paste this token in the Meldex VS Code extension → Connect screen.
          </p>
          <button
            onClick={() => setNewToken(null)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create new token */}
      <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Create new token</h2>
        <div className="flex gap-2">
          <input
            value={tokenName}
            onChange={e => setTokenName(e.target.value)}
            placeholder="Token name (e.g. VS Code MacBook)"
            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
          />
          <button
            onClick={createToken}
            disabled={creating || !tokenName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold transition-colors flex-shrink-0"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Token list */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Active tokens</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-white/4 p-6 text-center text-sm text-zinc-500">
            No tokens yet. Generate one above to connect your VS Code extension.
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-white/8 bg-white/4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{t.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Created {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => revokeToken(t.id)}
                  className="ml-3 p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  title="Revoke token"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How to use */}
      <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-white">How to connect</h3>
        <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
          <li>Open VS Code and click the <strong className="text-white">Meldex</strong> icon in the sidebar</li>
          <li>Click <strong className="text-white">Generate Token</strong> on this page</li>
          <li>Copy the token and paste it in the extension</li>
          <li>Click <strong className="text-white">Connect →</strong></li>
          <li>Your account will be linked immediately</li>
        </ol>
      </div>
    </div>
  );
}
