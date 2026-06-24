"use client";

import { useEffect, useState } from "react";
import { Cloud, KeyRound, PlugZap, Save, ShieldCheck } from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";
import { modelProviders } from "@/lib/product";

const defaultBaseUrl = "http://localhost:11434";
const defaultModel = "qwen3-coder:30b";

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [model, setModel] = useState(defaultModel);
  const [provider, setProvider] = useState("Ollama");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "Not tested" });

  useEffect(() => {
    setBaseUrl(localStorage.getItem("meldex:ollamaBaseUrl") || defaultBaseUrl);
    setModel(localStorage.getItem("meldex:ollamaModel") || defaultModel);
    setProvider(localStorage.getItem("meldex:modelProvider") || "Ollama");
  }, []);

  function save() {
    localStorage.setItem("meldex:ollamaBaseUrl", baseUrl);
    localStorage.setItem("meldex:ollamaModel", model);
    localStorage.setItem("meldex:modelProvider", provider);
    if (apiKey.trim()) {
      localStorage.setItem("meldex:modelKeyHint", `${provider}:configured`);
    }
    setStatus({ tone: "success", text: "Model config saved" });
  }

  async function testConnection() {
    setStatus({ tone: "idle", text: "Testing..." });
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          model,
          messages: [{ role: "user", content: "Reply with only: connected" }]
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }
      setStatus({ tone: "success", text: data.message ? "Connection ready" : "Connected with empty response" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Connection failed" });
    }
  }

  return (
    <SectionShell>
      <div className="mb-8">
        <p className="text-sm text-mint">Brains and Security</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Model Manager</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-5">
          <div className="mb-5 flex items-center gap-3">
            <KeyRound className="size-5 text-mint" />
            <h2 className="text-lg font-semibold text-white">Provider Configuration</h2>
          </div>
          <div className="grid gap-5">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-200">Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="rounded-md border-white/10 bg-slate-950 text-slate-100 focus:border-mint focus:ring-mint"
              >
                {modelProviders.map((item) => (
                  <option key={item.provider} value={item.provider}>
                    {item.provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-200">Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="rounded-md border-white/10 bg-slate-950 text-slate-100 focus:border-mint focus:ring-mint"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-200">Model</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="rounded-md border-white/10 bg-slate-950 text-slate-100 focus:border-mint focus:ring-mint"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-200">API Key</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                placeholder={provider === "Ollama" ? "Not required for local Ollama" : "Stored as a local placeholder until secrets are connected"}
                className="rounded-md border-white/10 bg-slate-950 text-slate-100 focus:border-mint focus:ring-mint"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-semibold text-slate-950">
                <Save className="size-4" />
                Save
              </button>
              <button onClick={testConnection} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
                <PlugZap className="size-4" />
                Test
              </button>
              <StatusPill tone={status.tone}>{status.text}</StatusPill>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Cloud className="size-5 text-iris" />
              <h2 className="text-lg font-semibold text-white">Local Brain and Cloud Brain</h2>
            </div>
            <div className="grid gap-2">
              {modelProviders.map((item) => (
                <div key={item.provider} className="grid gap-2 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm sm:grid-cols-[120px_1fr_72px_70px]">
                  <span className="font-semibold text-white">{item.provider}</span>
                  <span className="truncate text-slate-300">{item.model}</span>
                  <span className="text-slate-500">{item.limit}</span>
                  <span className={item.brain === "Local" ? "text-mint" : "text-iris"}>{item.brain}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="size-5 text-mint" />
              <h2 className="text-lg font-semibold text-white">Security Defaults</h2>
            </div>
            <div className="grid gap-2 text-sm leading-6 text-slate-300">
              <p>API validation is handled with Zod at route boundaries.</p>
              <p>Rate limiting is applied to chat, agent, workspace, and terminal routes.</p>
              <p>Secret storage is modeled in Prisma as encryptedApiKey for production integration.</p>
              <p>CSRF protection should be finalized with the authentication provider during NextAuth/Auth.js integration.</p>
            </div>
          </Panel>
        </div>
      </div>
    </SectionShell>
  );
}
