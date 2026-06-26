"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  CheckCheck,
  ChevronRight,
  CloudLightning,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  HardDriveDownload,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Send,
  Server,
  SquarePen,
  Terminal,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Confidence = "high" | "medium" | "low" | "unverified";

type ChatMode = "chat" | "agent";

type BrainType = "chat" | "search" | "agent" | "memory" | "project" | "planner" | "reasoner" | "multi_agent" | "math" | "time" | "utility" | "knowledge";

type IntentType = "general_chat" | "coding_agent" | "live_search" | "time_query" | "math_query";

type Source = { title: string; url: string; snippet?: string; tier?: number };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: ChatMode;
  intent?: IntentType;
  brain?: BrainType;
  brainLabel?: string;
  sources?: Source[];
  searchProvider?: string;
  confidence?: Confidence;
  checkedAt?: string;
  searchQueries?: string[];
  reasoning?: { thinking: string; verification: string; confidence: string; totalMs: number };
  plan?: object;
  agents?: { agent: string; durationMs: number }[];
};

type Conversation = {
  id: string;
  dbId?: string;  // DB-persisted conversation ID
  title: string;
  messages: Message[];
  mode: ChatMode;
};

type ProviderType = "local_ollama" | "openrouter" | "custom_openai_compatible";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MODEL_OPTIONS = [
  "qwen3-coder:30b",
  "qwen2.5-coder:32b",
  "llama3.1:8b",
  "qwen/qwen3-coder:free",
  "anthropic/claude-3-haiku",
];

const AGENT_KEYWORDS = [
  "build", "create", "landing page", "website", "app", "fix code",
  "edit file", "run project", "banavi aap", "bana", "code", "dashboard",
  "generate", "scaffold", "setup", "implement", "develop", "deploy",
  "component", "api", "database", "schema", "project", "repository",
];

const TIME_PATTERNS = [
  /ketla\s*v[a-z]*ya/i,
  /kel[ao]\s*vag/i,
  /what\s*time\s*(is\s*it)?/i,
  /time\s*shu\s*thay/i,
  /atyare\s*time/i,
  /current\s*time/i,
  /time\s*che/i,
  /time\s*keto/i,
  /સમય\s*ક/i,
  /અત્યારે\s*સ/i,
];

const CHAT_EXAMPLES = [
  { icon: MessageSquare, text: "kem cho? How are you?" },
  { icon: BrainCircuit, text: "Explain AI agents in Gujarati" },
  { icon: ChevronRight, text: "What is machine learning?" },
  { icon: ChevronRight, text: "Ketla vagya? What time is it?" },
];

const AGENT_EXAMPLES = [
  { icon: SquarePen, text: "Build a landing page for my SaaS product" },
  { icon: Code2, text: "Fix all TypeScript errors in this repo" },
  { icon: Terminal, text: "Create an admin panel with user management" },
  { icon: ChevronRight, text: "Scaffold a Next.js API route for auth" },
];

function uid() {
  return Math.random().toString(36).slice(2);
}

function isAgentTask(text: string): boolean {
  const lower = text.toLowerCase();
  return AGENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function isTimeQuery(text: string): boolean {
  return TIME_PATTERNS.some((p) => p.test(text));
}

function getCurrentTimeResponse(): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("gu-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `અત્યારે સમય **${timeStr}** છે.\n\n📅 ${dateStr}`;
}

// ---------------------------------------------------------------------------
// Brain Status Badge
// ---------------------------------------------------------------------------
function BrainBadge({ provider }: { provider: ProviderType | null }) {
  if (!provider) return null;
  if (provider === "openrouter") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-iris/15 px-2 py-0.5 text-xs font-medium text-iris">
        <CloudLightning className="size-3" />
        Cloud Test Brain
      </span>
    );
  }
  if (provider === "custom_openai_compatible") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <Server className="size-3" />
        Custom API
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
      <HardDriveDownload className="size-3" />
      Local Brain
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mode Badge
// ---------------------------------------------------------------------------
function ModeBadge({ mode }: { mode: ChatMode }) {
  if (mode === "agent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <Zap className="size-3" />
        Agent Mode
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
      <MessageSquare className="size-3" />
      Chat Mode
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mode Selector
// ---------------------------------------------------------------------------
function ModeSelector({ mode, onChange }: { mode: ChatMode; onChange: (m: ChatMode) => void }) {
  return (
    <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <button
        onClick={() => onChange("chat")}
        className={[
          "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition",
          mode === "chat"
            ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
        ].join(" ")}
      >
        <MessageSquare className="size-3" />
        Chat
      </button>
      <button
        onClick={() => onChange("agent")}
        className={[
          "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition",
          mode === "agent"
            ? "bg-amber-500/20 text-amber-300"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
        ].join(" ")}
      >
        <Zap className="size-3" />
        Agent
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active Brain Indicator
// ---------------------------------------------------------------------------
const BRAIN_META: Record<string, { label: string; color: string; bg: string }> = {
  chat:        { label: "CHAT",        color: "text-slate-400",   bg: "bg-slate-400/10 border-slate-400/20" },
  search:      { label: "SEARCH",      color: "text-sky-300",     bg: "bg-sky-400/10 border-sky-400/20" },
  agent:       { label: "AGENT",       color: "text-iris",        bg: "bg-iris/10 border-iris/20" },
  memory:      { label: "MEMORY",      color: "text-amber-300",   bg: "bg-amber-400/10 border-amber-400/20" },
  project:     { label: "PROJECT",     color: "text-cyan-300",    bg: "bg-cyan-400/10 border-cyan-400/20" },
  planner:     { label: "PLANNER",     color: "text-purple-300",  bg: "bg-purple-400/10 border-purple-400/20" },
  reasoner:    { label: "REASONER",    color: "text-orange-300",  bg: "bg-orange-400/10 border-orange-400/20" },
  multi_agent: { label: "MULTI-AGENT", color: "text-rose-300",    bg: "bg-rose-400/10 border-rose-400/20" },
  math:        { label: "MATH",        color: "text-emerald-300", bg: "bg-emerald-400/10 border-emerald-400/20" },
  time:        { label: "UTILITY",     color: "text-slate-400",   bg: "bg-slate-400/10 border-slate-400/20" },
  utility:     { label: "UTILITY",     color: "text-slate-400",   bg: "bg-slate-400/10 border-slate-400/20" },
  knowledge:   { label: "KNOWLEDGE",   color: "text-teal-300",    bg: "bg-teal-400/10 border-teal-400/20" },
};

function ActiveBrainBadge({ brain, label }: { brain?: BrainType; label?: string }) {
  if (!brain || brain === "chat") return null;
  const meta = BRAIN_META[brain] ?? BRAIN_META.chat;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.color} ${meta.bg}`}>
      {label ?? meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reasoning Panel (collapsible Think/Verify)
// ---------------------------------------------------------------------------
function ReasoningPanel({ reasoning }: { reasoning?: Message["reasoning"] }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-orange-400/70 transition hover:text-orange-300"
      >
        <ChevronRight className={`size-3 transition ${open ? "rotate-90" : ""}`} />
        Reasoning trace · {(reasoning.totalMs / 1000).toFixed(1)}s · {reasoning.confidence} confidence
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-orange-400/15 bg-orange-950/20 p-3 text-[11px]">
          <div>
            <p className="mb-1 font-semibold text-orange-400">💭 Thinking</p>
            <p className="whitespace-pre-wrap text-slate-400">{reasoning.thinking}</p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-orange-400">✅ Verification</p>
            <p className="whitespace-pre-wrap text-slate-400">{reasoning.verification}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-Agent Pipeline Trace
// ---------------------------------------------------------------------------
function AgentTrace({ agents }: { agents?: { agent: string; durationMs: number }[] }) {
  if (!agents || agents.length === 0) return null;
  const AGENT_EMOJI: Record<string, string> = {
    planner: "📋", researcher: "🔍", coder: "💻", tester: "🧪", reviewer: "✅",
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
      <span className="text-rose-400/70">Pipeline:</span>
      {agents.map((a, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span>→</span>}
          <span className="rounded border border-rose-400/15 bg-rose-400/5 px-1.5 py-0.5 text-rose-300/70">
            {AGENT_EMOJI[a.agent] ?? "🤖"} {a.agent} ({(a.durationMs / 1000).toFixed(1)}s)
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intent Badge
// ---------------------------------------------------------------------------
function IntentBadge({ intent, searchProvider }: { intent?: IntentType; searchProvider?: string }) {
  if (!intent || intent === "general_chat") return null;
  if (intent === "live_search") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
        <Globe className="size-2.5" />
        Live Search {searchProvider ? `· ${searchProvider}` : ""}
      </span>
    );
  }
  if (intent === "coding_agent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        <Zap className="size-2.5" />
        Agent
      </span>
    );
  }
  if (intent === "math_query") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-iris/25 bg-iris/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-iris">
        Math
      </span>
    );
  }
  if (intent === "time_query") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-mint/25 bg-mint/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mint">
        Time
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Confidence Badge
// ---------------------------------------------------------------------------
function ConfidenceBadge({ confidence }: { confidence?: Confidence }) {
  if (!confidence) return null;
  const map: Record<Confidence, { label: string; cls: string }> = {
    high: { label: "High confidence", cls: "border-mint/25 bg-mint/10 text-mint" },
    medium: { label: "Medium confidence", cls: "border-amber-400/25 bg-amber-400/10 text-amber-300" },
    low: { label: "Low confidence", cls: "border-orange-400/25 bg-orange-400/10 text-orange-300" },
    unverified: { label: "Unverified", cls: "border-red-400/25 bg-red-400/10 text-red-300" },
  };
  const { label, cls } = map[confidence];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Search Queries collapsible
// ---------------------------------------------------------------------------
function SearchQueriesPanel({ queries }: { queries?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!queries || queries.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-slate-600 transition hover:text-slate-400"
      >
        <ChevronRight className={`size-3 transition ${open ? "rotate-90" : ""}`} />
        {queries.length} search {queries.length === 1 ? "query" : "queries"} used
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-lg border border-white/8 bg-slate-950/60 p-2">
          {queries.map((q, i) => (
            <p key={i} className="font-mono text-[10px] text-slate-500">{q}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source Cards
// ---------------------------------------------------------------------------
function SourceCards({ sources, provider }: { sources: Source[]; provider?: string }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Sources {provider ? `· ${provider}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-sky-400/20 bg-sky-400/8 px-2.5 py-1 text-xs text-sky-300 transition hover:border-sky-400/40 hover:bg-sky-400/15"
          >
            <ExternalLink className="size-2.5 shrink-0" />
            <span className="max-w-[180px] truncate">{s.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code Block with copy
// ---------------------------------------------------------------------------
function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace("language-", "") ?? "";

  function copy() {
    void navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-3 rounded-lg border border-slate-200 bg-slate-950 text-sm dark:border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-xs text-slate-500">{language || "code"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-200"
        >
          {copied ? <CheckCheck className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-slate-200">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200">
          <Bot className="size-4" />
        </span>
      )}
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5 sm:max-w-[80%] lg:max-w-[70%]">
        {/* Brain + Intent badges above assistant message */}
        {!isUser && (message.brain || (message.intent && message.intent !== "general_chat")) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ActiveBrainBadge brain={message.brain} label={message.brainLabel} />
            <IntentBadge intent={message.intent} searchProvider={message.searchProvider} />
          </div>
        )}
        <div
          className={[
            "rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
            isUser
              ? "rounded-tr-sm bg-slate-950 text-white dark:bg-white dark:text-slate-950"
              : "rounded-tl-sm border border-slate-200 bg-white text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200",
          ].join(" ")}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const isBlock = className?.startsWith("language-");
                  if (isBlock) {
                    return (
                      <CodeBlock className={className}>{String(children).replace(/\n$/, "")}</CodeBlock>
                    );
                  }
                  return (
                    <code
                      className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800 dark:bg-white/10 dark:text-slate-200"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-950 underline underline-offset-2 hover:text-slate-700 dark:text-white dark:hover:text-slate-200"
                    >
                      {children}
                    </a>
                  );
                },
                ul({ children }) {
                  return <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>;
                },
                blockquote({ children }) {
                  return (
                    <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-500 dark:border-white/20 dark:text-slate-400">
                      {children}
                    </blockquote>
                  );
                },
                h1({ children }) {
                  return <h1 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{children}</h3>;
                },
                table({ children }) {
                  return (
                    <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-xs">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">{children}</th>;
                },
                td({ children }) {
                  return <td className="border-b border-slate-100 px-3 py-2 text-slate-700 dark:border-white/5 dark:text-slate-300">{children}</td>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {/* Source cards below search messages */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge confidence={message.confidence} />
              {message.checkedAt && (
                <span className="text-[10px] text-slate-600">
                  Checked at {new Date(message.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <SourceCards sources={message.sources} provider={message.searchProvider} />
            <SearchQueriesPanel queries={message.searchQueries} />
          </div>
        )}
        {/* Reasoning trace */}
        {!isUser && message.reasoning && (
          <ReasoningPanel reasoning={message.reasoning} />
        )}
        {/* Multi-agent pipeline trace */}
        {!isUser && message.agents && (
          <AgentTrace agents={message.agents} />
        )}
      </div>
      {isUser && (
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200">
          <span className="text-sm font-semibold">U</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------
function TypingIndicator({ model, mode }: { model: string; mode: ChatMode }) {
  const label = mode === "agent" ? `Agent working with ${model}…` : `Thinking with ${model}…`;
  return (
    <div className="flex gap-3">
      <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint">
        <Bot className="size-4" />
      </span>
      <div className="flex items-center gap-2 rounded-lg rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-slate-500 dark:bg-slate-300"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent mode suggestion banner
// ---------------------------------------------------------------------------
function AgentSuggestion({ onSwitch, onDismiss }: { onSwitch: () => void; onDismiss: () => void }) {
  return (
    <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-300 sm:mx-6">
      <div className="flex items-center gap-2">
        <Zap className="size-3.5 shrink-0" />
        <span>This looks like a coding task — switch to <strong>Agent Mode</strong> for file creation?</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={onSwitch}
          className="rounded border border-amber-400/40 px-2 py-0.5 font-medium transition hover:bg-amber-400/20"
        >
          Switch
        </button>
        <button onClick={onDismiss} className="text-amber-400/60 transition hover:text-amber-400">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  open,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white text-slate-950 transition-transform duration-200 dark:border-white/[0.08] dark:bg-[#090d14] dark:text-white lg:relative lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-white/[0.08]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <MessageSquare className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">Meldex Chat</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Conversations</span>
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={onNew}
              className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              title="New chat"
            >
              <MessageSquarePlus className="size-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white lg:hidden"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="thin-scrollbar flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">No chats yet</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => { onSelect(conv.id); onClose(); }}
              className={[
                "group mx-2 flex w-[calc(100%-16px)] items-center gap-2 truncate rounded-md px-3 py-2 text-left text-sm transition",
                conv.id === activeId
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white",
              ].join(" ")}
            >
              {conv.mode === "agent"
                ? <Zap className="size-3 shrink-0 text-amber-400/60" />
                : <MessageSquare className="size-3 shrink-0 text-sky-400/60" />
              }
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Format agent result to markdown
// ---------------------------------------------------------------------------
function formatAgentResult(result: {
  summary?: string;
  changedFiles?: string[];
  logs?: string[];
  terminalRuns?: { command: string; code: number; stdout: string; stderr: string }[];
  error?: string;
}): string {
  if (result.error) return `**Error:** ${result.error}`;

  const parts: string[] = [];

  if (result.summary) {
    parts.push(`## Summary\n${result.summary}`);
  }

  if (result.changedFiles && result.changedFiles.length > 0) {
    parts.push(`## Changed Files\n${result.changedFiles.map((f) => `- \`${f}\``).join("\n")}`);
  }

  if (result.terminalRuns && result.terminalRuns.length > 0) {
    const runs = result.terminalRuns
      .map((r) => {
        const status = r.code === 0 ? "✅" : "❌";
        const out = r.stdout?.trim() ? `\n\`\`\`\n${r.stdout.trim().slice(0, 500)}\n\`\`\`` : "";
        return `${status} \`${r.command}\`${out}`;
      })
      .join("\n\n");
    parts.push(`## Terminal\n${runs}`);
  }

  if (result.logs && result.logs.length > 0) {
    parts.push(`## Logs\n${result.logs.slice(-10).map((l) => `- ${l}`).join("\n")}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "Task completed.";
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [mode, setMode] = useState<ChatMode>("chat");
  const [input, setInput] = useState("");
  const [model, setModel] = useState("qwen3-coder:30b");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [brainProvider, setBrainProvider] = useState<ProviderType | null>(null);
  const [brainOnline, setBrainOnline] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAgentSuggestion, setShowAgentSuggestion] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  useEffect(() => {
    const storedModel = localStorage.getItem("meldex:ollamaModel");
    if (storedModel) setModel(storedModel);
    const storedMode = localStorage.getItem("meldex:chatMode") as ChatMode | null;
    if (storedMode === "chat" || storedMode === "agent") setMode(storedMode);

    fetch("/api/models/test")
      .then((r) => r.json())
      .then((d: { status?: string; provider?: ProviderType }) => {
        if (d.provider) setBrainProvider(d.provider);
        setBrainOnline(d.status === "ok");
      })
      .catch(() => setBrainOnline(false));

    // Load persisted conversations from DB
    fetch("/api/conversations")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { conversations?: { id: string; title: string; updatedAt: string }[] } | null) => {
        if (!d?.conversations?.length) return;
        setConversations((prev) => {
          const existing = new Set(prev.map((c) => c.dbId));
          const fresh = d.conversations!.filter((c) => !existing.has(c.id)).map((c) => ({
            id: uid(), dbId: c.id, title: c.title, messages: [], mode: "chat" as ChatMode,
          }));
          return [...prev, ...fresh];
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Show agent suggestion when user types agent keywords in chat mode
  useEffect(() => {
    if (mode === "chat" && input.trim() && isAgentTask(input)) {
      setShowAgentSuggestion(true);
    } else {
      setShowAgentSuggestion(false);
    }
  }, [input, mode]);

  function changeMode(m: ChatMode) {
    setMode(m);
    localStorage.setItem("meldex:chatMode", m);
    // Update active conversation mode
    if (activeConvId) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConvId ? { ...c, mode: m } : c))
      );
    }
  }

  const createNewChat = useCallback((withMode?: ChatMode) => {
    const id = uid();
    const conv: Conversation = {
      id,
      title: "New chat",
      messages: [],
      mode: withMode ?? mode,
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(id);
    setError("");
  }, [mode]);

  useEffect(() => {
    if (conversations.length === 0) createNewChat();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMessage() {
    const content = input.trim();
    if (!content || loading || !activeConvId) return;

    setShowAgentSuggestion(false);

    // Handle time queries inline without API call
    if (isTimeQuery(content)) {
      const userMsg: Message = { id: uid(), role: "user", content };
      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        content: getCurrentTimeResponse(),
        mode: "chat",
      };
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeConvId) return c;
          const title =
            c.title === "New chat" ? content.slice(0, 40) + (content.length > 40 ? "…" : "") : c.title;
          return { ...c, title, messages: [...c.messages, userMsg, assistantMsg] };
        })
      );
      setInput("");
      return;
    }

    const userMsg: Message = { id: uid(), role: "user", content, mode };

    const currentMessages = conversations.find((c) => c.id === activeConvId)?.messages ?? [];
    const updatedMessages = [...currentMessages, userMsg];

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvId) return c;
        const title =
          c.title === "New chat" ? content.slice(0, 40) + (content.length > 40 ? "…" : "") : c.title;
        return { ...c, title, mode, messages: updatedMessages };
      })
    );
    setInput("");
    setError("");
    setLoading(true);

    try {
      if (mode === "agent") {
        // Call /api/agent for coding tasks
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: content, model }),
        });
        const data: {
          summary?: string;
          changedFiles?: string[];
          logs?: string[];
          terminalRuns?: { command: string; code: number; stdout: string; stderr: string }[];
          error?: string;
        } = await response.json();

        if (!response.ok) throw new Error(data.error ?? "Agent task failed");

        const assistantMsg: Message = {
          id: uid(),
          role: "assistant",
          content: formatAgentResult(data),
          mode: "agent",
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId ? { ...c, messages: [...c.messages, assistantMsg] } : c
          )
        );
      } else {
        // Call /api/chat for conversational messages
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            mode: "chat",
            conversationId: conversations.find((c) => c.id === activeConvId)?.dbId,
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data: {
          message?: string;
          error?: string;
          provider?: ProviderType;
          intent?: IntentType;
          brain?: BrainType;
          brainLabel?: string;
          sources?: Source[];
          searchQuery?: string;
          searchProvider?: string;
          confidence?: Confidence;
          checkedAt?: string;
          searchQueries?: string[];
          reasoning?: { thinking: string; verification: string; confidence: string; totalMs: number };
          plan?: object;
          agents?: { agent: string; durationMs: number }[];
        } = await response.json();

        if (!response.ok) throw new Error(data.error ?? "Chat request failed");

        // Persist the DB conversation ID on first response
        if ((data as { conversationId?: string }).conversationId) {
          const dbConvId = (data as { conversationId?: string }).conversationId!;
          setConversations((prev) =>
            prev.map((c) => c.id === activeConvId && !c.dbId ? { ...c, dbId: dbConvId } : c)
          );
        }

        if (data.provider) setBrainProvider(data.provider);

        const assistantMsg: Message = {
          id: uid(),
          role: "assistant",
          content: data.message ?? "No response.",
          mode: "chat",
          intent: data.intent,
          brain: data.brain,
          brainLabel: data.brainLabel,
          sources: data.sources,
          searchProvider: data.searchProvider,
          confidence: data.confidence,
          checkedAt: data.checkedAt,
          searchQueries: data.searchQueries,
          reasoning: data.reasoning,
          plan: data.plan,
          agents: data.agents,
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId ? { ...c, messages: [...c.messages, assistantMsg] } : c
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const messages = activeConv?.messages ?? [];
  const examples = mode === "agent" ? AGENT_EXAMPLES : CHAT_EXAMPLES;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950 dark:bg-[#0b0f17] dark:text-white">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={(id) => {
          setActiveConvId(id);
          const conv = conversations.find((c) => c.id === id);
          if (conv) setMode(conv.mode);
        }}
        onNew={() => createNewChat()}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-3 backdrop-blur dark:border-white/[0.08] dark:bg-[#0b0f17]/90 sm:px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <BrainBadge provider={brainProvider} />
            {brainOnline !== null && (
              <span title={brainOnline ? "Brain online" : "Brain offline"} className="hidden sm:block">
                {brainOnline ? (
                  <Wifi className="size-4 text-mint" />
                ) : (
                  <WifiOff className="size-4 text-red-400" />
                )}
              </span>
            )}
            <ModeBadge mode={mode} />
          </div>

          <div className="flex items-center gap-2">
            <ModeSelector mode={mode} onChange={changeMode} />
            <label className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  localStorage.setItem("meldex:ollamaModel", e.target.value);
                }}
                className="rounded-md border border-slate-200 bg-white py-1 pl-2 pr-6 text-xs text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {!MODEL_OPTIONS.includes(model) && (
                  <option value={model}>{model}</option>
                )}
              </select>
            </label>
            <button
              onClick={() => createNewChat()}
              className="hidden rounded-md border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white sm:block"
              title="New chat"
            >
              <MessageSquarePlus className="size-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="thin-scrollbar flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0b0f17]">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
              <div>
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200">
                  {mode === "agent" ? <Zap className="size-7 text-amber-500" /> : <Bot className="size-7" />}
                </div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  {mode === "agent" ? "Agent Mode" : "Chat Mode"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {mode === "agent"
                    ? "Ask me to build, create files, fix code, or run tasks."
                    : "Ask me anything — Gujarati, Hindi, or English."}
                </p>
              </div>
              <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {examples.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.text}
                      onClick={() => setInput(p.text)}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                      {p.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-4 px-3 py-6 sm:px-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {loading && <TypingIndicator model={model} mode={mode} />}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Agent suggestion banner */}
        {showAgentSuggestion && (
          <AgentSuggestion
            onSwitch={() => { changeMode("agent"); setShowAgentSuggestion(false); }}
            onDismiss={() => setShowAgentSuggestion(false)}
          />
        )}

        {/* Input area */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 dark:border-white/[0.08] dark:bg-[#0b0f17] sm:px-4 sm:py-4">
          <div className="mx-auto flex max-w-4xl items-end gap-2 sm:gap-3">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={
                  mode === "agent"
                    ? "Describe a coding task… (Shift+Enter for new line)"
                    : "Message Meldex AI… (Shift+Enter for new line)"
                }
                className={[
                  "w-full resize-none rounded-lg border bg-white px-4 py-3 text-sm text-slate-950 placeholder-slate-400 shadow-sm transition focus:outline-none focus:ring-1 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder-slate-500",
                  mode === "agent"
                    ? "border-amber-400/30 focus:border-amber-500/60 focus:ring-amber-500/30"
                    : "border-slate-200 focus:border-slate-400 focus:ring-slate-300 dark:border-white/[0.08]",
                ].join(" ")}
              />
            </div>
            <button
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className={[
                "mb-0.5 grid size-10 shrink-0 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40",
                mode === "agent" ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
              ].join(" ")}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-500">
            {mode === "agent"
              ? "Agent Mode: can create/edit files and run safe commands."
              : "Chat Mode: conversational only, no file changes."}
          </p>
        </div>
      </div>
    </div>
  );
}
