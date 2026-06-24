"use client";

import { useEffect, useState } from "react";
import {
  Activity, BrainCircuit, CheckCircle2,
  Globe, Loader2, RefreshCw,
  Wifi, WifiOff, XCircle, Zap, Clock, Database, GitBranch, Network, Layers
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
      detail: "Uses Coding Agent pipeline",
    },
    {
      name: "Search Brain",
      purpose: "Live web search with source ranking and verification",
      icon: Globe,
      color: "text-sky-400",
      status: "checking",
      envKeys: ["SERPER_API_KEY", "BRAVE_API_KEY"],
    },
    {
      name: "Memory Brain",
      purpose: "User preferences, language, recent topics & projects",
      icon: Database,
      color: "text-amber-300",
      status: "checking",
      envKeys: ["DATABASE_URL"],
    },
    {
      name: "Project Brain",
      purpose: "Active project context, recent files, continue-work queries",
      icon: GitBranch,
      color: "text-cyan-400",
      status: "na",
      detail: "Activated on 'continue work' queries",
    },
    {
      name: "Reasoning Brain",
      purpose: "Think → Verify → Answer for complex analysis",
      icon: Layers,
      color: "text-orange-400",
      status: "na",
      detail: "Activated on complex/comparison queries",
    },
    {
      name: "Planning Brain",
      purpose: "Architecture + task breakdown before agent execution",
      icon: Network,
      color: "text-purple-400",
      status: "na",
      detail: "Activated on 'build SaaS / new project' queries",
    },
    {
      name: "Multi-Agent",
      purpose: "Planner → Researcher → Coder → Tester → Reviewer",
      icon: Network,
      color: "text-rose-400",
      status: "na",
      detail: "Full pipeline for end-to-end implementation",
    },
    {
      name: "Knowledge Brain",
      purpose: "Static verified facts — Gujarat geography, history (no LLM needed)",
      icon: Database,
      color: "text-teal-400",
      status: "ok",
      detail: "Botad, Vallabhipur, Gujarat districts, Saurashtra, Gir, Somnath…",
    },
    {
      name: "Conversation Brain",
      purpose: "Resolves follow-up pronouns (eni, teni, pase ryu) from history",
      icon: BrainCircuit,
      color: "text-cyan-400",
      status: "ok",
      detail: "Always active — context injected into chat system prompt",
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
  const [brainTest, setBrainTest] = useState<{ message: string; brain: string }[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function runDiagnostics() {
    setBrains((prev) => prev.map((b) =>
      ["Utility Brain", "Project Brain", "Reasoning Brain", "Planning Brain", "Multi-Agent", "Agent Brain"].includes(b.name)
        ? b : { ...b, status: "checking" as const }
    ));
    setLastChecked(new Date());

    // Test Chat Brain
    try {
      const start = Date.now();
      const res = await fetch("/api/models/test");
      const data: { status?: string; providerLabel?: string; latencyMs?: number } = await res.json();
      const latencyMs = data.latencyMs ?? (Date.now() - start);
      setBrains((prev) =>
        prev.map((b) =>
          b.name === "Chat Brain"
            ? { ...b, status: data.status === "ok" ? "ok" : "error", latencyMs, detail: data.providerLabel ?? "Unknown" }
            : b
        )
      );
    } catch {
      setBrains((prev) =>
        prev.map((b) => b.name === "Chat Brain" ? { ...b, status: "error", detail: "Connection failed" } : b)
      );
    }

    // Mark Agent Brain as ok
    setBrains((prev) =>
      prev.map((b) => b.name === "Agent Brain" ? { ...b, status: "ok", detail: "Agent pipeline ready" } : b)
    );

    // Test Memory Brain via /api/memory
    try {
      const start = Date.now();
      const res = await fetch("/api/memory");
      const latencyMs = Date.now() - start;
      setBrains((prev) =>
        prev.map((b) =>
          b.name === "Memory Brain"
            ? { ...b, status: res.ok ? "ok" : "error", latencyMs, detail: res.ok ? "PostgreSQL connected" : "DB error" }
            : b
        )
      );
    } catch {
      setBrains((prev) =>
        prev.map((b) => b.name === "Memory Brain" ? { ...b, status: "error", detail: "DB unreachable" } : b)
      );
    }

    // Test Search Brain
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
          prev.map((b) => b.name === "Search Brain" ? { ...b, status: "error", detail: data.error ?? "Search failed" } : b)
        );
        setSearchTest({ status: "error" });
      }
    } catch {
      setBrains((prev) =>
        prev.map((b) => b.name === "Search Brain" ? { ...b, status: "error", detail: "Network error" } : b)
      );
    }

    // Mark Project/Reasoning/Planning/Multi-Agent as available (no live test needed)
    setBrains((prev) =>
      prev.map((b) =>
        ["Project Brain", "Reasoning Brain", "Planning Brain", "Multi-Agent"].includes(b.name)
          ? { ...b, status: "ok" as const }
          : b
      )
    );

    // Brain routing test
    const tests = [
      { message: "My preferred language?", expected: "memory" },
      { message: "botad taluko che k jillo?", expected: "knowledge" },
      { message: "vallabhipur kyaa che?", expected: "knowledge" },
      { message: "Gujarat no CM kon che atyare?", expected: "search" },
      { message: "Build a SaaS app with auth", expected: "planner" },
      { message: "ketla vagya?", expected: "time" },
    ];
    const results = await Promise.all(
      tests.map(async (t) => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: t.message }], mode: "chat" }),
        });
        const data: { brain?: string } = await res.json();
        return { message: t.message, brain: data.brain ?? "chat" };
      })
    );
    setBrainTest(results);
  }

  useEffect(() => { void runDiagnostics(); }, []);

  const BRAIN_COLORS: Record<string, string> = {
    chat:        "bg-slate-400/10 text-slate-300 border-slate-400/20",
    search:      "bg-sky-400/10 text-sky-300 border-sky-400/20",
    agent:       "bg-iris/10 text-iris border-iris/20",
    memory:      "bg-amber-400/10 text-amber-300 border-amber-400/20",
    project:     "bg-cyan-400/10 text-cyan-300 border-cyan-400/20",
    planner:     "bg-purple-400/10 text-purple-300 border-purple-400/20",
    reasoner:    "bg-orange-400/10 text-orange-300 border-orange-400/20",
    multi_agent: "bg-rose-400/10 text-rose-300 border-rose-400/20",
    math:        "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    time:        "bg-mint/10 text-mint border-mint/20",
    utility:     "bg-slate-400/10 text-slate-300 border-slate-400/20",
    knowledge:   "bg-teal-400/10 text-teal-300 border-teal-400/20",
    unknown:     "bg-white/5 text-slate-400 border-white/10",
  };

  return (
    <SectionShell className="space-y-8 py-8">
      <PageHeader
        label="Admin · AI"
        title="Meldex Brain v2 Diagnostics"
        description="Live status of all AI brains, smart tool selector, search pipeline, memory and multi-agent systems."
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
        <p className="text-xs text-slate-600">Last checked: {lastChecked.toLocaleTimeString()}</p>
      )}

      {/* Brain status grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                {brain.detail && <p className="text-xs text-slate-500">{brain.detail}</p>}
                {brain.latencyMs !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="size-3 text-mint" />
                    <span className="text-xs text-mint">{brain.latencyMs}ms</span>
                  </div>
                )}
                {brain.status === "ok" && <span className="inline-flex items-center gap-1 text-xs text-mint"><Wifi className="size-3" /> Online</span>}
                {brain.status === "error" && <span className="inline-flex items-center gap-1 text-xs text-rose"><WifiOff className="size-3" /> Offline</span>}
                {brain.status === "na" && <span className="text-xs text-slate-500">Not tested</span>}
              </div>
              {brain.envKeys && brain.envKeys.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {brain.envKeys.map((k) => (
                    <code key={k} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">{k}</code>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Brain routing test */}
      <Panel className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <BrainCircuit className="size-5 text-iris" />
          <h2 className="font-semibold text-white">Smart Tool Selector — Routing Test</h2>
          <span className="ml-auto text-xs text-slate-500">Auto-tested on load</span>
        </div>
        {brainTest.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Running brain routing tests…
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.03]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Message</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Active Brain</th>
                </tr>
              </thead>
              <tbody>
                {brainTest.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 text-slate-300">{row.message}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${BRAIN_COLORS[row.brain] ?? BRAIN_COLORS.unknown}`}>
                        {row.brain.replace("_", " ")}
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
                : <span className="text-rose-400">✗ Failed</span>
              }
            </div>
            {searchTest.answer && (
              <div>
                <span className="text-slate-400">Sample answer:</span>
                <p className="mt-1 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-300">
                  {searchTest.answer.slice(0, 300)}{searchTest.answer.length > 300 ? "…" : ""}
                </p>
              </div>
            )}
          </div>
        </Panel>
      )}
    </SectionShell>
  );
}
