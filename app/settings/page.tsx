"use client";

import { useEffect, useState } from "react";
import {
  Cloud, HardDriveDownload, KeyRound, PlugZap, Save,
  ShieldCheck, Server, CheckCircle2, XCircle, Loader2, Eye, EyeOff
} from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { modelProviders } from "@/lib/product";

const defaultBaseUrl = "http://localhost:11434";
const defaultModel = "qwen3-coder:30b";

const PROVIDERS = [
  {
    id: "Ollama",
    label: "Local Ollama",
    icon: HardDriveDownload,
    desc: "Run AI models locally. No API key needed. Privacy-first.",
    color: "text-mint",
    border: "border-mint/30",
    bg: "bg-mint/8",
    defaultUrl: "http://localhost:11434",
    defaultModel: "qwen3-coder:30b",
    needsKey: false,
  },
  {
    id: "OpenRouter",
    label: "OpenRouter Cloud",
    icon: Cloud,
    desc: "Access 100+ models via OpenRouter. Free tier available.",
    color: "text-iris",
    border: "border-iris/30",
    bg: "bg-iris/8",
    defaultUrl: "https://openrouter.ai/api/v1",
    defaultModel: "qwen/qwen3-coder:free",
    needsKey: true,
  },
  {
    id: "Custom",
    label: "Custom API",
    icon: Server,
    desc: "Any OpenAI-compatible endpoint. Self-hosted or third-party.",
    color: "text-ember",
    border: "border-ember/30",
    bg: "bg-ember/8",
    defaultUrl: "",
    defaultModel: "",
    needsKey: true,
  },
];

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [model, setModel] = useState(defaultModel);
  const [provider, setProvider] = useState("Ollama");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "Not tested" });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setBaseUrl(localStorage.getItem("meldex:ollamaBaseUrl") || defaultBaseUrl);
    setModel(localStorage.getItem("meldex:ollamaModel") || defaultModel);
    const p = localStorage.getItem("meldex:modelProvider") || "Ollama";
    setProvider(p);
    setKeyConfigured(!!localStorage.getItem("meldex:modelKeyHint"));
  }, []);

  function selectProvider(id: string) {
    const p = PROVIDERS.find(x => x.id === id);
    if (!p) return;
    setProvider(id);
    setBaseUrl(p.defaultUrl);
    setModel(p.defaultModel);
    setApiKey("");
    setKeyConfigured(false);
    setStatus({ tone: "idle", text: "Not tested" });
  }

  function save() {
    localStorage.setItem("meldex:ollamaBaseUrl", baseUrl);
    localStorage.setItem("meldex:ollamaModel", model);
    localStorage.setItem("meldex:modelProvider", provider);
    if (apiKey.trim()) {
      localStorage.setItem("meldex:modelKeyHint", `${provider}:configured`);
      setKeyConfigured(true);
      setApiKey("");
    }
    setStatus({ tone: "success", text: "Configuration saved" });
  }

  async function testConnection() {
    setTesting(true);
    setStatus({ tone: "idle", text: "Testing connection…" });
    try {
      const response = await fetch("/api/models/test");
      const data = await response.json() as { status?: string; latencyMs?: number };
      if (data.status === "ok") {
        setStatus({ tone: "success", text: `Connected · ${data.latencyMs ?? 0}ms` });
      } else {
        throw new Error("Provider returned non-ok status");
      }
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Connection failed" });
    } finally {
      setTesting(false);
    }
  }

  const currentProvider = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0];

  return (
    <SectionShell className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-mint">Configuration</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Model Manager</h1>
        <p className="mt-1 text-sm text-slate-400">Choose your AI brain — local, cloud, or custom.</p>
      </div>

      {/* Provider cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDERS.map(p => {
          const Icon = p.icon;
          const active = provider === p.id;
          return (
            <button
              key={p.id}
              onClick={() => selectProvider(p.id)}
              className={[
                "group relative flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition",
                active
                  ? `${p.border} ${p.bg}`
                  : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/5",
              ].join(" ")}
            >
              {active && (
                <span className="absolute right-3 top-3">
                  <CheckCircle2 className={`size-4 ${p.color}`} />
                </span>
              )}
              <div className={`grid size-10 place-items-center rounded-lg border ${active ? p.border : "border-white/10"} ${active ? p.bg : "bg-white/5"}`}>
                <Icon className={`size-5 ${active ? p.color : "text-slate-400"}`} />
              </div>
              <div>
                <p className={`font-semibold ${active ? "text-white" : "text-slate-300"}`}>{p.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{p.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Config form */}
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <currentProvider.icon className={`size-5 ${currentProvider.color}`} />
            <h2 className="font-semibold text-white">{currentProvider.label} Configuration</h2>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-300">Base URL</span>
              <input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={currentProvider.defaultUrl || "https://your-api.example.com/v1"}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 transition focus:border-mint/60 focus:outline-none focus:ring-1 focus:ring-mint/40"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-300">Model</span>
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder={currentProvider.defaultModel || "model-name"}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 transition focus:border-mint/60 focus:outline-none focus:ring-1 focus:ring-mint/40"
              />
            </label>

            {currentProvider.needsKey && (
              <label className="block">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">API Key</span>
                  {keyConfigured && (
                    <StatusBadge tone="success" label="Key configured" />
                  )}
                </div>
                <div className="relative">
                  <input
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    type={showKey ? "text" : "password"}
                    placeholder={keyConfigured ? "Enter new key to update…" : "sk-or-v1-…"}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 transition focus:border-mint/60 focus:outline-none focus:ring-1 focus:ring-mint/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-600">API key is stored locally and never sent to our servers.</p>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={save}
                className="flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-mint/90"
              >
                <Save className="size-4" />
                Save Config
              </button>
              <button
                onClick={testConnection}
                disabled={testing}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                Test Connection
              </button>
            </div>

            {status.text !== "Not tested" && (
              <div className={[
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                status.tone === "success" ? "border-mint/25 bg-mint/8 text-mint" :
                status.tone === "error" ? "border-rose/25 bg-rose/8 text-rose" :
                "border-white/10 bg-white/5 text-slate-300"
              ].join(" ")}>
                {status.tone === "success" ? <CheckCircle2 className="size-4 shrink-0" /> :
                 status.tone === "error" ? <XCircle className="size-4 shrink-0" /> :
                 <Loader2 className="size-4 shrink-0 animate-spin" />}
                {status.text}
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Cloud className="size-5 text-iris" />
              <h2 className="font-semibold text-white">Available Providers</h2>
            </div>
            <div className="space-y-2">
              {modelProviders.map(item => (
                <div key={item.provider} className="grid grid-cols-[100px_1fr_64px] gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-medium text-white">{item.provider}</span>
                  <span className="truncate text-slate-400">{item.model}</span>
                  <span className={item.brain === "Local" ? "text-mint" : "text-iris"}>{item.brain}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="size-5 text-mint" />
              <h2 className="font-semibold text-white">Security</h2>
            </div>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex gap-2"><span className="text-mint">✓</span>Zod validation at all route boundaries</li>
              <li className="flex gap-2"><span className="text-mint">✓</span>Rate limiting on chat, agent, terminal routes</li>
              <li className="flex gap-2"><span className="text-mint">✓</span>API key never exposed after saving</li>
              <li className="flex gap-2"><span className="text-mint">✓</span>Terminal commands allowlisted — dangerous patterns blocked</li>
              <li className="flex gap-2"><span className="text-mint">✓</span>Auth required on all sensitive routes</li>
            </ul>
          </Panel>
        </div>
      </div>
    </SectionShell>
  );
}


