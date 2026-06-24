"use client";

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CloudLightning,
  HardDriveDownload,
  Info,
  Loader2,
  PlugZap,
  Server,
} from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";

type BrainMode = "local_ollama" | "openrouter" | "custom_openai_compatible";

interface TestResult {
  tone: "success" | "error" | "idle";
  text: string;
  latencyMs?: number;
  providerLabel?: string;
}

const BRAIN_OPTIONS: {
  id: BrainMode;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  notes: string[];
}[] = [
  {
    id: "local_ollama",
    label: "Local Brain",
    sublabel: "Ollama on your machine",
    icon: HardDriveDownload,
    color: "text-mint",
    notes: [
      "Runs fully offline — no API key needed",
      "Requires Ollama running at OLLAMA_BASE_URL",
      "Default model: qwen3-coder:30b",
    ],
  },
  {
    id: "openrouter",
    label: "Cloud Test Brain",
    sublabel: "OpenRouter · qwen/qwen3-coder:free",
    icon: CloudLightning,
    color: "text-iris",
    notes: [
      "Uses OpenRouter's free-tier Qwen3-Coder model",
      "Set OPENROUTER_API_KEY in .env.local (never stored in browser)",
      "Instant setup — no local GPU required",
    ],
  },
  {
    id: "custom_openai_compatible",
    label: "Custom API",
    sublabel: "Any OpenAI-compatible endpoint",
    icon: Server,
    color: "text-amber-400",
    notes: [
      "Set CUSTOM_AI_BASE_URL, CUSTOM_AI_API_KEY, CUSTOM_AI_MODEL in .env.local",
      "Compatible with Together AI, Fireworks, vLLM, LM Studio, and others",
      "API keys are never stored in the browser",
    ],
  },
];

export default function BrainSettingsPage() {
  const [activeBrain, setActiveBrain] = useState<BrainMode>("local_ollama");
  const [serverBrain, setServerBrain] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult>({ tone: "idle", text: "Not tested" });
  const [testing, setTesting] = useState(false);

  // Load preferred brain from localStorage (UI hint only — actual routing is server-side)
  useEffect(() => {
    const stored = localStorage.getItem("meldex:brainPreference") as BrainMode | null;
    if (stored) setActiveBrain(stored);
    // Detect server's current active provider via test endpoint
    fetch("/api/models/test", { method: "GET" })
      .then((r) => r.json())
      .then((d) => {
        if (d.providerLabel) setServerBrain(d.providerLabel);
      })
      .catch(() => {});
  }, []);

  function selectBrain(mode: BrainMode) {
    setActiveBrain(mode);
    localStorage.setItem("meldex:brainPreference", mode);
    setTest({ tone: "idle", text: "Not tested" });
  }

  async function runTest() {
    setTesting(true);
    setTest({ tone: "idle", text: "Testing connection…" });
    try {
      const response = await fetch("/api/models/test", { method: "GET" });
      const data: { status?: string; latencyMs?: number; error?: string; providerLabel?: string } =
        await response.json();

      if (!response.ok || data.status !== "ok") {
        setTest({ tone: "error", text: data.error ?? "Connection failed" });
      } else {
        setTest({
          tone: "success",
          text: `Connected — ${data.latencyMs ?? "?"}ms`,
          latencyMs: data.latencyMs,
          providerLabel: data.providerLabel,
        });
        if (data.providerLabel) setServerBrain(data.providerLabel);
      }
    } catch {
      setTest({ tone: "error", text: "Request failed — check server logs" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SectionShell>
      <div className="mb-8">
        <p className="text-sm text-mint">Settings · AI Brains</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Brain Settings</h1>
        <p className="mt-2 text-sm text-slate-400">
          Choose which AI brain powers Meldex. Routing is controlled via{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-slate-200">
            MELDEX_BRAIN_PROVIDER
          </code>{" "}
          in your server environment.
        </p>
      </div>

      {serverBrain && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-iris/30 bg-iris/10 px-4 py-3 text-sm text-slate-200">
          <Info className="size-4 shrink-0 text-iris" />
          <span>
            Server is currently using:{" "}
            <span className="font-semibold text-iris">{serverBrain}</span>
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {BRAIN_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = activeBrain === option.id;
          return (
            <button
              key={option.id}
              onClick={() => selectBrain(option.id)}
              className={[
                "group relative flex flex-col gap-3 rounded-xl border p-5 text-left transition-all",
                selected
                  ? "border-mint/60 bg-mint/5 ring-1 ring-mint/30"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between">
                <div className={["rounded-lg border border-white/10 bg-white/5 p-2", option.color].join(" ")}>
                  <Icon className="size-5" />
                </div>
                {selected && (
                  <CheckCircle2 className="size-5 shrink-0 text-mint" />
                )}
              </div>
              <div>
                <p className="font-semibold text-white">{option.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{option.sublabel}</p>
              </div>
              <ul className="mt-1 grid gap-1">
                {option.notes.map((note) => (
                  <li key={note} className="flex items-start gap-1.5 text-xs text-slate-400">
                    <ChevronRight className="mt-0.5 size-3 shrink-0 text-slate-600" />
                    {note}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <Panel className="mt-6 p-5">
        <div className="mb-4 flex items-center gap-2">
          <BrainCircuit className="size-5 text-mint" />
          <h2 className="text-lg font-semibold text-white">Connection Test</h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Tests the active server-side brain provider (set via{" "}
          <code className="rounded bg-white/10 px-1 font-mono text-xs text-slate-200">
            MELDEX_BRAIN_PROVIDER
          </code>
          ). Your preference above is saved as a local hint only.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runTest}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlugZap className="size-4" />
            )}
            Test Active Brain
          </button>
          <StatusPill tone={test.tone}>{test.text}</StatusPill>
        </div>
      </Panel>

      <Panel className="mt-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          How to switch brain providers
        </h2>
        <ol className="grid gap-2 text-sm leading-6 text-slate-400">
          <li>
            <span className="font-medium text-slate-200">1.</span> Open{" "}
            <code className="rounded bg-white/10 px-1 font-mono text-xs text-slate-200">.env.local</code>
          </li>
          <li>
            <span className="font-medium text-slate-200">2.</span> Set{" "}
            <code className="rounded bg-white/10 px-1 font-mono text-xs text-slate-200">
              MELDEX_BRAIN_PROVIDER=openrouter
            </code>{" "}
            (or <code className="rounded bg-white/10 px-1 font-mono text-xs">local_ollama</code> /{" "}
            <code className="rounded bg-white/10 px-1 font-mono text-xs">custom_openai_compatible</code>)
          </li>
          <li>
            <span className="font-medium text-slate-200">3.</span> For OpenRouter, also add{" "}
            <code className="rounded bg-white/10 px-1 font-mono text-xs text-slate-200">
              OPENROUTER_API_KEY=sk-or-…
            </code>
          </li>
          <li>
            <span className="font-medium text-slate-200">4.</span> Restart the dev server (
            <code className="rounded bg-white/10 px-1 font-mono text-xs text-slate-200">npm run dev</code>
            )
          </li>
          <li>
            <span className="font-medium text-slate-200">5.</span> Click &ldquo;Test Active Brain&rdquo; above to verify
          </li>
        </ol>
      </Panel>
    </SectionShell>
  );
}
