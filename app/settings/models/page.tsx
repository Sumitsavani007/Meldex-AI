"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Edit, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

interface ModelConfig {
  id: string;
  provider: string;
  name: string;
  model: string;
  baseUrl?: string;
  isDefault: boolean;
}

const providers = [
  { id: "OPENROUTER", name: "OpenRouter", latency: "420ms", cost: "$$", health: "Healthy" },
  { id: "OPENAI", name: "OpenAI", latency: "350ms", cost: "$$$", health: "Ready" },
  { id: "ANTHROPIC", name: "Anthropic", latency: "480ms", cost: "$$$", health: "Ready" },
  { id: "OLLAMA", name: "Ollama Local", latency: "Local", cost: "Free", health: "Optional" },
];

export default function ModelConfigPage() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ provider: "OPENROUTER", model: "", name: "", baseUrl: "", apiKey: "" });

  async function fetchModels() {
    setLoading(true);
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchModels(); }, []);

  async function saveModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          model: form.model,
          name: form.name,
          baseUrl: form.baseUrl || undefined,
          apiKey: form.apiKey || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save model");
      setShowForm(false);
      setForm({ provider: "OPENROUTER", model: "", name: "", baseUrl: "", apiKey: "" });
      await fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <UserPanelShell title="Models" description="Provider health, costs, latency, and model configuration." eyebrow="Models">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {providers.map((provider) => (
              <PanelCard key={provider.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Bot className="size-4" /></span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{provider.health}</span>
                </div>
                <h2 className="mt-4 text-sm font-semibold">{provider.name}</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">Latency<br /><span className="font-semibold text-slate-900 dark:text-white">{provider.latency}</span></div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">Cost<br /><span className="font-semibold text-slate-900 dark:text-white">{provider.cost}</span></div>
                </div>
              </PanelCard>
            ))}
          </div>

          <PanelCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Configured Models</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Securely stored server-side model entries.</p>
              </div>
              <SoftButton onClick={() => setShowForm((value) => !value)} variant="primary"><Plus className="size-4" /> Add Model</SoftButton>
            </div>

            {showForm && (
              <form onSubmit={saveModel} className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                {error && <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">{error}</div>}
                <div className="grid gap-3 md:grid-cols-2">
                  <select value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#111113]">
                    {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                  </select>
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#111113]" placeholder="Display name" />
                  <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#111113]" placeholder="Model id" />
                  <input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#111113]" placeholder="Base URL optional" />
                  <input type="password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#111113] md:col-span-2" placeholder="API key optional" />
                </div>
                <div className="mt-4 flex gap-2">
                  <SoftButton type="submit" disabled={saving || !form.name.trim() || !form.model.trim()} variant="primary">{saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save Model</SoftButton>
                  <SoftButton type="button" onClick={() => setShowForm(false)}>Cancel</SoftButton>
                </div>
              </form>
            )}

            {loading ? (
              <div className="grid gap-2">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.06]" />)}</div>
            ) : models.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.04]">No models configured yet.</div>
            ) : (
              <div className="space-y-2">
                {models.map((model) => (
                  <div key={model.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]">
                    <span className="grid size-10 place-items-center rounded-xl bg-slate-50 text-violet-600 dark:bg-white/[0.05]"><Zap className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{model.name}</p>{model.isDefault && <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">Default</span>}</div>
                      <p className="mt-1 truncate text-xs text-slate-500">{model.provider} · {model.model}</p>
                    </div>
                    <button disabled title="Edit model is not available in V1" className="grid size-9 cursor-not-allowed place-items-center rounded-lg text-slate-300"><Edit className="size-4" /></button>
                    <button disabled title="Delete model is not available in V1" className="grid size-9 cursor-not-allowed place-items-center rounded-lg text-slate-300"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </section>

        <aside className="space-y-5">
          <PanelCard>
            <h2 className="text-sm font-semibold">Recommended</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Primary coding model remains Qwen3-Coder through Meldex backend/OpenRouter.</p>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Health</h2>
            <div className="mt-4 space-y-3">
              {providers.slice(0, 3).map((provider) => (
                <div key={provider.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm dark:bg-white/[0.04]">
                  <span>{provider.name}</span><span className="text-emerald-600 dark:text-emerald-300">{provider.health}</span>
                </div>
              ))}
            </div>
          </PanelCard>
        </aside>
      </div>
    </UserPanelShell>
  );
}
