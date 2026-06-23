"use client";

import { useEffect, useState } from "react";
import { PlugZap, Save } from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";

const defaultBaseUrl = "http://localhost:11434";
const defaultModel = "qwen3-coder:30b";

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [model, setModel] = useState(defaultModel);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "Not tested" });

  useEffect(() => {
    setBaseUrl(localStorage.getItem("meldex:ollamaBaseUrl") || defaultBaseUrl);
    setModel(localStorage.getItem("meldex:ollamaModel") || defaultModel);
  }, []);

  function save() {
    localStorage.setItem("meldex:ollamaBaseUrl", baseUrl);
    localStorage.setItem("meldex:ollamaModel", model);
    setStatus({ tone: "success", text: "Settings saved" });
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
        <p className="text-sm text-mint">Local Agent</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Settings</h1>
      </div>
      <Panel className="max-w-3xl p-5">
        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Ollama Base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              className="rounded-md border-white/10 bg-slate-950 text-slate-100 focus:border-mint focus:ring-mint"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Model Name</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="rounded-md border-white/10 bg-slate-950 text-slate-100 focus:border-mint focus:ring-mint"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-semibold text-slate-950">
              <Save className="size-4" />
              Save Settings
            </button>
            <button onClick={testConnection} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
              <PlugZap className="size-4" />
              Test Connection
            </button>
            <StatusPill tone={status.tone}>{status.text}</StatusPill>
          </div>
        </div>
      </Panel>
    </SectionShell>
  );
}
