"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Archive,
  CheckCheck,
  ChevronRight,
  Code2,
  Copy,
  CopyPlus,
  Download,
  Edit3,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pin,
  RotateCcw,
  Search,
  Send,
  SquarePen,
  StopCircle,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppShell } from "@/components/app-shell";
import { logoutFromMeldex } from "@/lib/client-session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Confidence = "high" | "medium" | "low" | "unverified";

type ChatMode = "chat" | "agent";

type BrainType = "coding" | "chat" | "search" | "agent" | "memory" | "project" | "planner" | "reasoner" | "multi_agent" | "math" | "time" | "utility" | "knowledge";

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
  title: string;
  messages: Message[];
  mode: ChatMode;
  pinned?: boolean;
  archived?: boolean;
  updatedAt?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
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
  { icon: Code2, text: "Explain AI agents in Gujarati" },
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

function getDateGroup(updatedAt?: number) {
  const date = updatedAt ? new Date(updatedAt) : new Date();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - startOfThatDay) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 Days";
  if (diffDays <= 30) return "Previous Month";
  return "Older";
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
  return `અત્યારે સમય **${timeStr}** છે.\n\n${dateStr}`;
}

// ---------------------------------------------------------------------------
// Mode Badge
// ---------------------------------------------------------------------------
function ModeBadge({ mode }: { mode: ChatMode }) {
  if (mode === "agent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <Zap className="size-3" />
        Agent Mode
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
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
    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-white/10 dark:bg-white/5">
      <button
        onClick={() => onChange("chat")}
        className={[
          "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition",
          mode === "chat"
            ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
            : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white",
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
            ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
            : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white",
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
  agent:       { label: "AGENT",       color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-600/10 border-blue-600/20" },
  memory:      { label: "MEMORY",      color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-600/10 border-slate-600/20" },
  project:     { label: "PROJECT",     color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-600/10 border-blue-600/20" },
  planner:     { label: "PLANNER",     color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-600/10 border-slate-600/20" },
  reasoner:    { label: "REASONER",    color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-600/10 border-slate-600/20" },
  multi_agent: { label: "MULTI-AGENT", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-600/10 border-blue-600/20" },
  math:        { label: "MATH",        color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-600/10 border-slate-600/20" },
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
        className="flex items-center gap-1 text-[10px] text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ChevronRight className={`size-3 transition ${open ? "rotate-90" : ""}`} />
        Reasoning trace · {(reasoning.totalMs / 1000).toFixed(1)}s · {reasoning.confidence} confidence
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-white/10 dark:bg-white/[0.03]">
          <div>
            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Thinking</p>
            <p className="whitespace-pre-wrap text-slate-500 dark:text-slate-400">{reasoning.thinking}</p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Verification</p>
            <p className="whitespace-pre-wrap text-slate-500 dark:text-slate-400">{reasoning.verification}</p>
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
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
      <span>Pipeline:</span>
      {agents.map((a, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span>→</span>}
          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
            {a.agent} ({(a.durationMs / 1000).toFixed(1)}s)
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
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <Zap className="size-2.5" />
        Agent
      </span>
    );
  }
  if (intent === "math_query") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        Math
      </span>
    );
  }
  if (intent === "time_query") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
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
    high: { label: "High confidence", cls: "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:text-blue-300" },
    medium: { label: "Medium confidence", cls: "border-slate-300 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" },
    low: { label: "Low confidence", cls: "border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-300" },
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
        <div className="mt-1.5 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/[0.03]">
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
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-[#262626] dark:bg-[#171717] dark:text-[#a1a1aa] dark:hover:bg-[#202020]"
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
  const [wrapped, setWrapped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const language = className?.replace("language-", "") ?? "";

  function copy() {
    void navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-[#262626] bg-[#171717] text-sm text-slate-100">
      <div className="flex items-center justify-between border-b border-[#262626] bg-[#111111] px-3 py-2">
        <span className="text-xs font-medium text-[#a1a1aa]">{language || "code"}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWrapped((value) => !value)}
            className="mx-focus rounded-md px-2 py-1 text-xs text-[#a1a1aa] transition hover:bg-[#202020] hover:text-white"
          >
            {wrapped ? "Unwrap" : "Wrap"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mx-focus rounded-md px-2 py-1 text-xs text-[#a1a1aa] transition hover:bg-[#202020] hover:text-white"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={copy}
            className="mx-focus flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#a1a1aa] transition hover:bg-[#202020] hover:text-white"
          >
            {copied ? <CheckCheck className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className={[
        "overflow-x-auto p-4 leading-6 text-slate-200",
        wrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        expanded ? "max-h-none" : "max-h-[420px]",
      ].join(" ")}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------
function MessageBubble({
  message,
  onRetry,
  onEdit,
}: {
  message: Message;
  onRetry?: () => void;
  onEdit?: () => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  function copyMessage() {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={[
        "flex min-w-0 flex-col gap-1.5",
        isUser ? "max-w-[85%] sm:max-w-[76%] lg:max-w-[66%]" : "w-full max-w-3xl",
      ].join(" ")}>
        {/* Brain + Intent badges above assistant message */}
        {!isUser && (message.brain || (message.intent && message.intent !== "general_chat")) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ActiveBrainBadge brain={message.brain} label={message.brainLabel} />
            <IntentBadge intent={message.intent} searchProvider={message.searchProvider} />
          </div>
        )}
        <div
          className={[
            "text-[15px] leading-7",
            isUser
              ? "rounded-3xl bg-[#f4f4f5] px-4 py-2.5 text-slate-950 dark:bg-[#2f2f2f] dark:text-white"
              : "text-slate-900 dark:text-white",
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
                      className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
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
                    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                      <table className="w-full text-xs">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">{children}</th>;
                },
                td({ children }) {
                  return <td className="border-b border-slate-100 px-3 py-2 text-slate-600 dark:border-white/5 dark:text-slate-300">{children}</td>;
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
        <div className={`flex gap-1 opacity-70 transition hover:opacity-100 ${isUser ? "justify-end" : "justify-start"}`}>
          <button
            onClick={copyMessage}
            className="mx-focus rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-[#202020] dark:hover:text-white"
            title="Copy"
          >
            {copied ? <CheckCheck className="size-3.5 text-blue-600 dark:text-blue-400" /> : <Copy className="size-3.5" />}
          </button>
          {isUser && onEdit && (
            <button
              onClick={onEdit}
              className="mx-focus rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-[#202020] dark:hover:text-white"
              title="Edit prompt"
            >
              <Edit3 className="size-3.5" />
            </button>
          )}
          {!isUser && onRetry && (
            <button
              onClick={onRetry}
              className="mx-focus rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-[#202020] dark:hover:text-white"
              title="Retry"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------
function TypingIndicator({ mode }: { mode: ChatMode }) {
  const label = mode === "agent" ? "Meldex is preparing workspace changes…" : "Meldex is thinking…";
  return (
    <div className="flex w-full justify-start">
      <div className="flex max-w-3xl items-center gap-2 rounded-2xl px-1 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-[#a1a1aa]"
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
    <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 sm:mx-6">
      <div className="flex items-center gap-2">
        <Zap className="size-3.5 shrink-0" />
        <span>This looks like a coding task — switch to <strong>Agent Mode</strong> for file creation?</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={onSwitch}
          className="mx-focus rounded border border-slate-200 bg-white px-2 py-0.5 font-medium transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          Switch
        </button>
        <button onClick={onDismiss} className="text-slate-400 transition hover:text-slate-700 dark:hover:text-white">
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
  onRename,
  onPin,
  onArchive,
  onDuplicate,
  onExport,
  onDelete,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
  userEmail,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  userEmail?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState(false);
  const expanded = !collapsed || hovered;
  const visibleConversations = conversations
    .filter((conv) => !conv.archived)
    .filter((conv) => conv.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const pinned = visibleConversations.filter((conv) => conv.pinned);
  const unpinned = visibleConversations.filter((conv) => !conv.pinned);
  const groups = ["Today", "Yesterday", "Previous 7 Days", "Previous Month", "Older"]
    .map((label) => ({ label, items: unpinned.filter((conv) => getDateGroup(conv.updatedAt) === label) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          "fixed inset-y-0 left-0 z-40 flex border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-all duration-300 ease-out dark:border-[#262626] dark:bg-[#111111]/95 lg:relative lg:translate-x-0",
          "w-[260px]",
          expanded ? "lg:w-[260px]" : "lg:w-[68px]",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex w-full flex-col">
        <div className="flex items-center justify-between px-3 py-3">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={["mx-focus hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white lg:grid", !expanded ? "lg:hidden" : ""].join(" ")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          {expanded && <span className="text-sm font-semibold text-slate-950 dark:text-white">New Chat</span>}
          <div className="flex gap-1">
            <button
              onClick={onNew}
              className="mx-focus rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
              title="New chat"
            >
              <MessageSquarePlus className="size-4" />
            </button>
            <button
              onClick={onClose}
              className="mx-focus rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:hover:bg-[#202020] dark:hover:text-white lg:hidden"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {expanded && <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onNew}
            className="mx-focus mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-200 dark:text-white dark:hover:bg-[#202020]"
          >
            <MessageSquarePlus className="size-4" />
            New Chat
          </button>
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search history"
              className="w-full appearance-none rounded-lg border-0 bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none dark:bg-[#202020] dark:text-white dark:placeholder:text-[#71717a]"
            />
          </label>
        </div>}
        <div className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-3">
          {!expanded ? (
            <div className="grid gap-1 pt-1">
              <button
                type="button"
                onClick={onNew}
                className="mx-focus grid size-11 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
                title="New chat"
              >
                <MessageSquarePlus className="size-4" />
              </button>
            </div>
          ) : (
            <>
              {visibleConversations.length === 0 && (
                <p className="px-3 py-3 text-xs text-slate-500 dark:text-[#71717a]">No chats yet</p>
              )}
              {pinned.length > 0 && (
                <HistorySection
                  label="Pinned"
                  conversations={pinned}
                  activeId={activeId}
                  onSelect={onSelect}
                  onClose={onClose}
                  onRename={onRename}
                  onPin={onPin}
                  onArchive={onArchive}
                  onDuplicate={onDuplicate}
                  onExport={onExport}
                  onDelete={onDelete}
                />
              )}
              {groups.map((group) => (
                <HistorySection
                  key={group.label}
                  label={group.label}
                  conversations={group.items}
                  activeId={activeId}
                  onSelect={onSelect}
                  onClose={onClose}
                  onRename={onRename}
                  onPin={onPin}
                  onArchive={onArchive}
                  onDuplicate={onDuplicate}
                  onExport={onExport}
                  onDelete={onDelete}
                />
              ))}
            </>
          )}
        </div>
        <div className="border-t border-slate-200 p-2 dark:border-[#262626]">
          <button
            type="button"
            onClick={() => void logoutFromMeldex("/login")}
            className={[
              "mx-focus flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm text-slate-700 transition hover:bg-slate-200 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white",
              !expanded ? "justify-center" : "",
            ].join(" ")}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-[#2f2f2f]">
              {(userEmail?.[0] ?? "U").toUpperCase()}
            </span>
            {expanded && (
              <>
                <span className="min-w-0 flex-1 truncate">{userEmail ?? "Account"}</span>
                <LogOut className="size-4 text-slate-400" />
              </>
            )}
          </button>
        </div>
        </div>
      </aside>
    </>
  );
}

function HistorySection({
  label,
  conversations,
  activeId,
  onSelect,
  onClose,
  onRename,
  onPin,
  onArchive,
  onDuplicate,
  onExport,
  onDelete,
}: {
  label: string;
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRename: (id: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mt-3">
      <p className="px-3 pb-1 text-xs font-medium text-slate-500 dark:text-[#71717a]">{label}</p>
      <div className="space-y-0.5">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={[
              "group flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-sm transition",
              conv.id === activeId
                ? "bg-slate-200 text-slate-950 dark:bg-[#202020] dark:text-white"
                : "text-slate-700 hover:bg-slate-200 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white",
            ].join(" ")}
          >
            <button
              onClick={() => { onSelect(conv.id); onClose(); }}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
            >
              {conv.pinned ? <Pin className="size-3 shrink-0" /> : <MessageSquare className="size-3 shrink-0" />}
              <span className="truncate">{conv.title}</span>
            </button>
            <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <button onClick={() => onRename(conv.id)} className="mx-focus rounded p-1 hover:bg-white/60 dark:hover:bg-white/10" title="Rename"><Edit3 className="size-3" /></button>
              <button onClick={() => onPin(conv.id)} className="mx-focus rounded p-1 hover:bg-white/60 dark:hover:bg-white/10" title="Pin"><Pin className="size-3" /></button>
              <button onClick={() => onDuplicate(conv.id)} className="mx-focus rounded p-1 hover:bg-white/60 dark:hover:bg-white/10" title="Duplicate"><CopyPlus className="size-3" /></button>
              <button onClick={() => onExport(conv.id)} className="mx-focus rounded p-1 hover:bg-white/60 dark:hover:bg-white/10" title="Export"><Download className="size-3" /></button>
              <button onClick={() => onArchive(conv.id)} className="mx-focus rounded p-1 hover:bg-white/60 dark:hover:bg-white/10" title="Archive"><Archive className="size-3" /></button>
              <button onClick={() => onDelete(conv.id)} className="mx-focus rounded p-1 text-red-500 hover:bg-red-500/10" title="Delete"><Trash2 className="size-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
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
        const status = r.code === 0 ? "Passed" : "Failed";
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
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [mode, setMode] = useState<ChatMode>("chat");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showAgentSuggestion, setShowAgentSuggestion] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";

  useEffect(() => {
    const storedMode = localStorage.getItem("meldex:chatMode") as ChatMode | null;
    if (storedMode === "chat" || storedMode === "agent") setMode(storedMode);
    const storedCollapsed = localStorage.getItem("meldex:sidebarCollapsed");
    setSidebarCollapsed(storedCollapsed === null ? true : storedCollapsed === "true");
    const storedConversations = localStorage.getItem("meldex:conversations");
    if (storedConversations) {
      try {
        const parsed = JSON.parse(storedConversations) as Conversation[];
        setConversations(parsed);
        setActiveConvId(parsed.find((c) => !c.archived)?.id ?? parsed[0]?.id ?? "");
        return;
      } catch {
        localStorage.removeItem("meldex:conversations");
      }
    }
    const id = uid();
    setConversations([{ id, title: "New chat", messages: [], mode: "chat", updatedAt: Date.now() }]);
    setActiveConvId(id);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setMode("chat");
    }
  }, [isAdmin]);

  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem("meldex:conversations", JSON.stringify(conversations));
    }
  }, [conversations]);

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
    if (isAdmin && mode === "chat" && input.trim() && isAgentTask(input)) {
      setShowAgentSuggestion(true);
    } else {
      setShowAgentSuggestion(false);
    }
  }, [input, mode, isAdmin]);

  function changeMode(m: ChatMode) {
    if (m === "agent" && !isAdmin) return;
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
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(id);
    setError("");
  }, [mode]);

  async function sendMessage(overrideContent?: string) {
    const content = (overrideContent ?? input).trim();
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
          return { ...c, title, updatedAt: Date.now(), messages: [...c.messages, userMsg, assistantMsg] };
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
        return { ...c, title, mode, updatedAt: Date.now(), messages: updatedMessages };
      })
    );
    setInput("");
    setError("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (mode === "agent" && isAdmin) {
        // Call /api/agent for coding tasks
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ task: content }),
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
            c.id === activeConvId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, assistantMsg] } : c
          )
        );
      } else {
        // Call /api/chat for conversational messages
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode: "chat",
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data: {
          message?: string;
          error?: string;
          provider?: string;
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
            c.id === activeConvId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, assistantMsg] } : c
          )
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("");
      } else {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  const messages = activeConv?.messages ?? [];
  const examples = mode === "agent" ? AGENT_EXAMPLES : CHAT_EXAMPLES;

  function renameConversation(id: string) {
    const current = conversations.find((c) => c.id === id)?.title ?? "";
    const title = window.prompt("Rename conversation", current)?.trim();
    if (!title) return;
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title, updatedAt: Date.now() } : c));
  }

  function pinConversation(id: string) {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c));
  }

  function archiveConversation(id: string) {
    setConversations((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, archived: true, updatedAt: Date.now() } : c);
      if (activeConvId === id) setActiveConvId(next.find((c) => !c.archived)?.id ?? "");
      return next;
    });
  }

  function duplicateConversation(id: string) {
    const source = conversations.find((c) => c.id === id);
    if (!source) return;
    const nextId = uid();
    const copy: Conversation = {
      ...source,
      id: nextId,
      title: `${source.title} copy`,
      pinned: false,
      archived: false,
      updatedAt: Date.now(),
      messages: source.messages.map((message) => ({ ...message, id: uid() })),
    };
    setConversations((prev) => [copy, ...prev]);
    setActiveConvId(nextId);
  }

  function exportConversation(id: string) {
    const source = conversations.find((c) => c.id === id);
    if (!source) return;
    const markdown = [
      `# ${source.title}`,
      "",
      ...source.messages.map((message) => `## ${message.role === "user" ? "User" : "Meldex"}\n\n${message.content}`),
    ].join("\n\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${source.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "conversation"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function deleteConversation(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeConvId === id) setActiveConvId(next.find((c) => !c.archived)?.id ?? "");
      return next;
    });
  }

  function editPrompt(message: Message) {
    setInput(message.content);
    textareaRef.current?.focus();
  }

  function retryLastAssistant() {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser || loading) return;
    void sendMessage(lastUser.content);
  }

  function stopGeneration() {
    abortRef.current?.abort();
    setLoading(false);
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("meldex:sidebarCollapsed", String(next));
      return next;
    });
  }

  return (
    <AppShell title="Chat" description="Talk with Meldex AI in Gujarati, Hindi, or English." fullBleed>
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-[#f7f7fb] text-slate-950 dark:bg-[#0d0d0f] dark:text-white">
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
        onRename={renameConversation}
        onPin={pinConversation}
        onArchive={archiveConversation}
        onDuplicate={duplicateConversation}
        onExport={exportConversation}
        onDelete={deleteConversation}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        userEmail={session?.user?.email}
      />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#0d0d0d]">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur-xl sm:px-4 dark:border-white/10 dark:bg-[#0d0d0d]/90">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="mx-focus rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="size-5" />
            </button>
            <div className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 dark:text-white">
              New Chat
            </div>
            {isAdmin && <ModeBadge mode={mode} />}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && <ModeSelector mode={mode} onChange={changeMode} />}
            <button
              onClick={() => createNewChat()}
              className="mx-focus hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white sm:block"
              title="New chat"
            >
              <MessageSquarePlus className="size-4" />
            </button>
            <button
              type="button"
              className="mx-focus rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
              aria-label="More options"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="thin-scrollbar flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-7 p-6 text-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                  How can I help?
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
                      className="mx-focus flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:border-[#262626] dark:bg-[#171717] dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      {p.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onEdit={msg.role === "user" ? () => editPrompt(msg) : undefined}
                  onRetry={msg.role === "assistant" ? retryLastAssistant : undefined}
                />
              ))}
              {loading && <TypingIndicator mode={mode} />}
              {error && (
                <div className="rounded-lg border border-red-600/20 bg-red-600/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
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
        <div className="shrink-0 bg-white px-3 pb-4 pt-2 dark:bg-[#0d0d0d] sm:px-4 sm:pb-5">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm shadow-slate-950/5 dark:border-[#262626] dark:bg-[#171717]">
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
                    ? "Describe a coding task..."
                    : "Message Meldex AI..."
                }
                className="mx-focus max-h-[220px] min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-6 text-slate-950 shadow-none outline-none placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-[#71717a]"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <div className="flex items-center gap-1">
                  <button type="button" disabled title="File attachments are not available in this release" className="mx-focus grid size-9 cursor-not-allowed place-items-center rounded-full text-slate-300 dark:text-[#4b4b4b]" aria-label="Attach files unavailable">
                    <Paperclip className="size-4" />
                  </button>
                  <button type="button" disabled title="Image attachments are not available in this release" className="mx-focus grid size-9 cursor-not-allowed place-items-center rounded-full text-slate-300 dark:text-[#4b4b4b]" aria-label="Attach image unavailable">
                    <ImageIcon className="size-4" />
                  </button>
                  <button type="button" disabled title="Voice input is not available in this release" className="mx-focus grid size-9 cursor-not-allowed place-items-center rounded-full text-slate-300 dark:text-[#4b4b4b]" aria-label="Voice input unavailable">
                    <Mic className="size-4" />
                  </button>
                </div>
                {loading ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    className="mx-focus grid size-9 place-items-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    aria-label="Stop generation"
                  >
                    <StopCircle className="size-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!input.trim()}
                    className="mx-focus grid size-9 place-items-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    aria-label="Send message"
                  >
                    <Send className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {isAdmin && <p className="mt-2 text-center text-xs text-slate-500 dark:text-[#71717a]">
            {mode === "agent"
              ? "Agent Mode: can create/edit files and run safe commands."
              : "Chat Mode: conversational only, no file changes."}
          </p>}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
