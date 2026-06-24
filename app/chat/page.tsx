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
type ChatMode = "chat" | "agent";

type IntentType = "general_chat" | "coding_agent" | "live_search" | "time_query" | "math_query";

type Source = { title: string; url: string; snippet?: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: ChatMode;
  intent?: IntentType;
  sources?: Source[];
  searchProvider?: string;
};

type Conversation = {
  id: string;
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
    <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-xs font-medium text-mint">
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
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/15 px-2 py-0.5 text-xs font-medium text-sky-400">
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
    <div className="flex rounded-lg border border-white/10 bg-slate-950 p-0.5">
      <button
        onClick={() => onChange("chat")}
        className={[
          "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition",
          mode === "chat"
            ? "bg-sky-500/20 text-sky-300"
            : "text-slate-500 hover:text-slate-300",
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
            : "text-slate-500 hover:text-slate-300",
        ].join(" ")}
      >
        <Zap className="size-3" />
        Agent
      </button>
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
    <div className="group relative my-3 rounded-lg border border-white/10 bg-slate-950 text-sm">
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
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint">
          <Bot className="size-4" />
        </span>
      )}
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5 sm:max-w-[80%] lg:max-w-[70%]">
        {/* Intent badge above assistant message */}
        {!isUser && message.intent && message.intent !== "general_chat" && (
          <div className="flex items-center gap-1.5">
            <IntentBadge intent={message.intent} searchProvider={message.searchProvider} />
          </div>
        )}
        <div
          className={[
            "rounded-xl px-4 py-3 text-sm leading-6",
            isUser
              ? "rounded-tr-sm border border-mint/25 bg-mint/10 text-slate-100"
              : "rounded-tl-sm border border-white/10 bg-white/[0.04] text-slate-200",
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
                      className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-slate-200"
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
                      className="text-mint underline underline-offset-2 hover:text-mint/80"
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
                    <blockquote className="my-2 border-l-2 border-iris pl-3 text-slate-400">
                      {children}
                    </blockquote>
                  );
                },
                h1({ children }) {
                  return <h1 className="mt-3 text-lg font-bold text-white">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="mt-3 text-base font-semibold text-white">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="mt-2 text-sm font-semibold text-slate-200">{children}</h3>;
                },
                table({ children }) {
                  return (
                    <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-xs">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return <th className="border-b border-white/10 bg-white/5 px-3 py-2 text-left font-semibold text-slate-200">{children}</th>;
                },
                td({ children }) {
                  return <td className="border-b border-white/5 px-3 py-2 text-slate-300">{children}</td>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {/* Source cards below search messages */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceCards sources={message.sources} provider={message.searchProvider} />
        )}
      </div>
      {isUser && (
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-iris/10 text-iris">
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
      <div className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-mint/60"
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
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-slate-950 transition-transform duration-200 lg:relative lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white">Chats</span>
          <div className="flex gap-1">
            <button
              onClick={onNew}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              title="New chat"
            >
              <MessageSquarePlus className="size-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="thin-scrollbar flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <p className="px-4 py-3 text-xs text-slate-600">No chats yet</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => { onSelect(conv.id); onClose(); }}
              className={[
                "group flex w-full items-center gap-2 truncate px-4 py-2 text-left text-sm transition",
                conv.id === activeId
                  ? "bg-mint/10 text-mint"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
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
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data: {
          message?: string;
          error?: string;
          provider?: ProviderType;
          intent?: IntentType;
          sources?: Source[];
          searchQuery?: string;
          searchProvider?: string;
        } = await response.json();

        if (!response.ok) throw new Error(data.error ?? "Chat request failed");

        if (data.provider) setBrainProvider(data.provider);

        const assistantMsg: Message = {
          id: uid(),
          role: "assistant",
          content: data.message ?? "No response.",
          mode: "chat",
          intent: data.intent,
          sources: data.sources,
          searchProvider: data.searchProvider,
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
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-900">
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
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/80 px-3 py-3 backdrop-blur sm:px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
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
                className="rounded border border-white/10 bg-slate-950 py-1 pl-2 pr-6 text-xs text-slate-100 focus:border-mint focus:ring-1 focus:ring-mint"
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
              className="hidden rounded-md border border-white/10 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white sm:block"
              title="New chat"
            >
              <MessageSquarePlus className="size-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="thin-scrollbar flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
              <div>
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-mint/10 text-mint">
                  {mode === "agent" ? <Zap className="size-7 text-amber-400" /> : <Bot className="size-7" />}
                </div>
                <h2 className="text-xl font-semibold text-white">
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
                      className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left text-sm text-slate-300 transition hover:border-mint/40 hover:bg-mint/5 hover:text-white"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-mint" />
                      {p.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-3 py-6 sm:px-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {loading && <TypingIndicator model={model} mode={mode} />}
              {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
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
        <div className="shrink-0 border-t border-white/10 bg-slate-900 px-3 py-3 sm:px-4 sm:py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2 sm:gap-3">
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
                  "w-full resize-none rounded-xl border bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-1",
                  mode === "agent"
                    ? "border-amber-400/20 focus:border-amber-400/60 focus:ring-amber-400/40"
                    : "border-white/10 focus:border-mint/60 focus:ring-mint/40",
                ].join(" ")}
              />
            </div>
            <button
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className={[
                "mb-0.5 grid size-10 shrink-0 place-items-center rounded-xl text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40",
                mode === "agent" ? "bg-amber-400 hover:bg-amber-400/90" : "bg-mint hover:bg-mint/90",
              ].join(" ")}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-600">
            {mode === "agent"
              ? "Agent Mode: can create/edit files and run safe commands."
              : "Chat Mode: conversational only, no file changes."}
          </p>
        </div>
      </div>
    </div>
  );
}
