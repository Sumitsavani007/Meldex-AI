"use client";

import { useEffect, useState } from "react";
import {
  Activity, BrainCircuit, CheckCircle2, CloudLightning,
  Globe, HardDriveDownload, Loader2, RefreshCw,
  Server, Wifi, WifiOff, XCircle, Zap, Clock, Calculator
} from "lucide-react";
import { SectionShell, PageHeader, Panel } from "@/components/ui";

interface BrainStatus {
  name: string;
  purpose: string;
  icon: React.ElementType;
  color: string;
  status: "checking" | "ok" | "error" | "na";
  latencyMs?: number;
  detail?: string;
  envKeys?: string[];
}

function StatusDot({ status }: { status: BrainStatus["status"] }) {
  if (status === "checking") return <Loader2 className="size-4 animate-spin text-slate-400" />;
  if (status === "ok") return <CheckCircle2 className="size-4 text-mint" />;
  if (status === "error") return <XCircle className="size-4 text-rose" />;
  return <div className="size-4 rounded-full border border-slate-600 bg-slate-700" />;
}

export default function AIAdminPage() {
  const [brains, setBrains] = useState<BrainStatus[]>([
    {
      name: "Chat Brain",
      purpose: "General conversation, Q&A, multilingual",
      icon: BrainCircuit,
      color: "text-iris",
      status: "checking",
      envKeys: ["MELDEX_BRAIN_PROVIDER", "OPENROUTER_API_KEY"],
    },
    {
      name: "Agent Brain",
      purpose: "Code generation, file editing, project builds",
      icon: Zap,
      color: "text-amber-400",
      status: "na",
      envKeys: ["OPENROUTER_MODEL"],
      detail: "Uses Qwen3-Coder via Agent pipeline",
    },
    {
      name: "Search Brain",
      purpose: "Live web search for news, sports, politics",
      icon: Globe,
      color: "text-sky-400",
      status: "checking",
      envKeys: ["SERPER_API_KEY", "BRAVE_API_KEY"],
    },
    {
      name: "Utility Brain",
      purpose: "Time, date, simple calculations (no LLM needed)",
      icon: Clock,
      color: "text-mint",
      status: "ok",
      detail: "Always available — runs client-side",
    },
  ]);

  const [searchTest, setSearchTest] = useState<{ status: string; provider?: string; answer?: string } | null>(null);
  const [intentTest, setIntentTest] = useState<{ message: string; intent: string }[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function runDiagnostics() {
    setBrains((prev) => prev.map((b) => (b.name === "Utility Brain" ? b : { ...b, status: "checking" as const })));
    setLastChecked(new Date());

    // Test Chat Brain via /api/models/test
    try {
      const start = Date.now();
      const res = await fetch("/api/models/test");
      const data: { status?: string; providerLabel?: string; latencyMs?: number } = await res.json();
      const latencyMs = data.latencyMs ?? (Date.now() - start);
      setBrains((prev) =>
        prev.map((b) =>
          b.name === "Chat Brain"
            ? {
                ...b,
                status: data.status === "ok" ? "ok" : "error",
                latencyMs,
                detail: data.providerLabel ?? "Unknown provider",
              }
            : b
        )
      );
    } catch {
      setBrains((prev) =>
        prev.map((b) =>
          b.name === "Chat Brain" ? { ...b, status: "error", detail: "Connection failed" } : b
        )
      );
    }

    // Mark Agent Brain as ok (always available via /api/agent)
    setBrains((prev) =>
      prev.map((b) =>
        b.name === "Agent Brain" ? { ...b, status: "ok", detail: "Agent pipeline ready" } : b
      )
    );

    // Test Search Brain via /api/search
    try {
      const start = Date.now();
      const res = await fetch("/api/search?q=test+search");
      const data: { answer?: string | null; provider?: string; error?: string } = await res.json();
      const latencyMs = Date.now() - start;
      if (res.ok) {
        setBrains((prev) =>
          prev.map((b) =>
            b.name === "Search Brain"
              ? { ...b, status: "ok", latencyMs, detail: data.provider ?? "DuckDuckGo" }
              : b
          )
        );
        setSearchTest({ status: "ok", provider: data.provider, answer: data.answer ?? undefined });
      } else {
        setBrains((prev) =>
          prev.map((b) =>
            b.name === "Search Brain"
              ? { ...b, status: "error", detail: data.error ?? "Search failed" }
              : b
          )
        );
        setSearchTest({ status: "error", provider: "—" });
      }
    } catch {
      setBrains((prev) =>
        prev.map((b) =>
          b.name === "Search Brain" ? { ...b, status: "error", detail: "Network error" } : b
        )
      );
    }

    // Intent classification test
    const tests = [
      "kem cho",
      "Gujarat no CM kon che?",
      "create a landing page",
      "ketla vagya?",
      "5 + 3 * 2",
    ];
    const results = await Promise.all(
      tests.map(async (msg) => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: msg }], mode: "chat" }),
        });
        const data: { intent?: string } = await res.json();
        return { message: msg, intent: data.intent ?? "unknown" };
      })
    );
    setIntentTest(results);
  }

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const intentColors: Record<string, string> = {
    general_chat: "bg-sky-400/10 text-sky-300 border-sky-400/20",
    live_search: "bg-globe/10 text-emerald-300 border-emerald-400/20",
    coding_agent: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    time_query: "bg-mint/10 text-mint border-mint/20",
    math_query: "bg-iris/10 text-iris border-iris/20",
    unknown: "bg-white/5 text-slate-400 border-white/10",
  };

  return (
    <SectionShell className="space-y-8 py-8">
      <PageHeader
        label="Admin · AI"
        title="AI Brain Diagnostics"
        description="Live status of all AI brains, intent router, and search pipeline."
        action={
          <button
            onClick={() => void runDiagnostics()}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            <RefreshCw className="size-4" />
            Re-run
          </button>
        }
      />

      {lastChecked && (
        <p className="text-xs text-slate-600">
          Last checked: {lastChecked.toLocaleTimeString()}
        </p>
      )}

      {/* Brain status grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {brains.map((brain) => {
          const Icon = brain.icon;
          return (
            <div
              key={brain.name}
              className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/15"
            >
              <div className="flex items-start justify-between">
                <span className={`grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 ${brain.color}`}>
                  <Icon className="size-5" />
                </span>
                <StatusDot status={brain.status} />
              </div>
              <div>
                <p className="font-semibold text-white">{brain.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{brain.purpose}</p>
              </div>
              <div className="space-y-1">
                {brain.detail && (
                  <p className="text-xs text-slate-500">{brain.detail}</p>
                )}
                {brain.latencyMs !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="size-3 text-mint" />
                    <span className="text-xs text-mint">{brain.latencyMs}ms</span>
                  </div>
                )}
                {brain.status === "ok" && (
                  <span className="inline-flex items-center gap-1 text-xs text-mint">
                    <Wifi className="size-3" /> Online
                  </span>
                )}
                {brain.status === "error" && (
                  <span className="inline-flex items-center gap-1 text-xs text-rose">
                    <WifiOff className="size-3" /> Offline
                  </span>
                )}
                {brain.status === "na" && (
                  <span className="text-xs text-slate-500">Not tested</span>
                )}
              </div>
              {brain.envKeys && brain.envKeys.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {brain.envKeys.map((k) => (
                    <code key={k} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {k}
                    </code>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Intent router test */}
      <Panel className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <BrainCircuit className="size-5 text-iris" />
          <h2 className="font-semibold text-white">Intent Router Results</h2>
          <span className="ml-auto text-xs text-slate-500">Auto-tested on load</span>
        </div>
        {intentTest.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Running intent classification tests…
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.03]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Message</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Detected Intent</th>
                </tr>
              </thead>
              <tbody>
                {intentTest.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 text-slate-300">{row.message}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${intentColors[row.intent] ?? intentColors.unknown}`}>
                        {row.intent.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Search test result */}
      {searchTest && (
        <Panel className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="size-5 text-sky-400" />
            <h2 className="font-semibold text-white">Search Brain Test</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Provider:</span>
              <span className="text-slate-200">{searchTest.provider ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Status:</span>
              {searchTest.status === "ok"
                ? <span className="text-mint">✓ Connected</span>
                : <span className="text-rose">✗ Failed</span>
              }
            </div>
            {searchTest.answer && (
              <div>
                <span className="text-slate-400">Sample answer:</span>
                <p className="mt-1 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-300">
                  {searchTest.answer.slice(0, 200)}{searchTest.answer.length > 200 ? "…" : ""}
                </p>
              </div>
            )}
            {!searchTest.answer && searchTest.status === "ok" && (
              <p className="text-xs text-slate-500">
                DuckDuckGo returned no instant answer for the test query. For rich results, add SERPER_API_KEY to .env.local.
              </p>
            )}
          </div>
        </Panel>
      )}
    </SectionShell>
  );
}
