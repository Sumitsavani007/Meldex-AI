"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, Plus, RotateCw, Search, Trash2, AlertCircle } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

type TokenRecord = {
  id: string;
  name: string;
  maskedToken: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "revoked";
};

const ALL_SCOPES = ["chat", "agent", "model-health", "benchmark"];

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("VS Code Extension");
  const [expiresInDays, setExpiresInDays] = useState(365);
  const [scopes, setScopes] = useState<string[]>(ALL_SCOPES);

  async function loadTokens() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account/tokens", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load tokens");
      setTokens(data.tokens || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTokens(); }, []);

  async function createToken() {
    setCreating(true);
    setError("");
    setNewToken(null);
    try {
      const res = await fetch("/api/account/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresInDays, scopes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create token");
      setNewToken(data.token);
      setTokens(data.tokens || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    if (!confirm("Revoke this token? Any extension using it will automatically log out.")) return;
    const res = await fetch(`/api/account/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to revoke token");
      return;
    }
    await loadTokens();
  }

  async function copyRawToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  }

  return (
    <UserPanelShell title="API Tokens" description="Create mdx_ tokens for VS Code extension, CLI, benchmark runs, and agent access." eyebrow="API Tokens">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">

      {newToken && (
        <section className="rounded-2xl border border-emerald-600/25 bg-emerald-600/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 className="size-4" /> Token created. Copy it now.
          </div>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 rounded-md border border-emerald-600/20 bg-white px-3 py-2 font-mono text-xs text-emerald-800 break-all dark:bg-black/40 dark:text-emerald-200">{newToken}</code>
            <button onClick={copyRawToken} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/30 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-100">
              {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-100/70">After refresh, this raw token is gone forever.</p>
        </section>
      )}

      <PanelCard>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
            <KeyRound className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Create token</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Raw token is shown once after creation.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_150px]">
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-300 dark:border-white/10 dark:bg-white/[0.04]" placeholder="Token name" />
          <select value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_SCOPES.map((scope) => (
            <label key={scope} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
              {scope}
            </label>
          ))}
        </div>
        <SoftButton onClick={createToken} disabled={creating || !name.trim() || scopes.length === 0} variant="primary" className="mt-4">
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create token
        </SoftButton>
      </PanelCard>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-600/30 bg-red-600/10 p-3 text-sm text-red-700 dark:text-red-200"><AlertCircle className="size-4" />{error}</div>}

      <PanelCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Active token list</h2>
          <div className="flex items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04]">
              <Search className="size-4" />
              <input className="w-44 appearance-none border-0 bg-transparent p-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search tokens" />
            </label>
            <button onClick={loadTokens} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]" title="Refresh tokens">
              <RotateCw className="size-4" />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.06]" />)}
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-400">No tokens yet. Create a token to connect VS Code or the CLI.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Token</th>
                  <th className="p-3">Scopes</th>
                  <th className="p-3">Dates</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="border-t border-slate-200 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]">
                    <td className="p-3 font-medium">{token.name}</td>
                    <td className="p-3 font-mono text-xs text-slate-600 dark:text-slate-300">{token.maskedToken}</td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{token.scopes.join(", ")}</td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">
                      <div>Created {new Date(token.createdAt).toLocaleDateString()}</div>
                      <div>Expires {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "Never"}</div>
                      <div>Last used {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : "Never"}</div>
                    </td>
                    <td className="p-3 text-xs"><span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{token.status}</span></td>
                    <td className="p-3 text-right">
                      <button onClick={() => revokeToken(token.id)} disabled={token.status === "revoked"} className="rounded-md p-2 text-slate-500 hover:bg-red-600/10 hover:text-red-700 disabled:opacity-30 dark:text-slate-400 dark:hover:text-red-200" title="Revoke token">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
        </section>
        <aside className="space-y-5">
          <PanelCard>
            <h2 className="text-sm font-semibold">Token Security</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>Raw tokens are shown once and never stored in reports or logs.</p>
              <p>Revoked tokens automatically log out connected extensions on the next auth check.</p>
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Activity</h2>
            <div className="mt-4 space-y-3">
              {["Create", "Copy once", "Revoke anytime"].map((item) => (
                <div key={item} className="rounded-xl bg-slate-50 px-3 py-3 text-sm dark:bg-white/[0.04]">{item}</div>
              ))}
            </div>
          </PanelCard>
        </aside>
      </div>
    </UserPanelShell>
  );
}
