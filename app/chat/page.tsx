"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  CheckCheck,
  ChevronRight,
  CloudLightning,
  Copy,
  HardDriveDownload,
  Menu,
  MessageSquarePlus,
  Send,
  Server,
  SquarePen,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
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

const EXAMPLE_PROMPTS = [
  { icon: SquarePen, text: "Build a landing page for my SaaS product" },
  { icon: BrainCircuit, text: "Fix all TypeScript errors in this repo" },
  { icon: ChevronRight, text: "Create an admin panel with user management" },
  { icon: ChevronRight, text: "Explain this error and give me the fix" },
];

function uid() {
  return Math.random().toString(36).slice(2);
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
      <div
        className={[
          "max-w-[80%] rounded-xl px-4 py-3 text-sm leading-6 lg:max-w-[70%]",
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
            }}
          >
            {message.content}
          </ReactMarkdown>
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
function TypingIndicator({ model }: { model: string }) {
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
        <span className="text-xs text-slate-500">Thinking with {model}…</span>
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
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      {/* Sidebar panel */}
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
                "w-full truncate px-4 py-2 text-left text-sm transition",
                conv.id === activeId
                  ? "bg-mint/10 text-mint"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              ].join(" ")}
            >
              {conv.title}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [input, setInput] = useState("");
  const [model, setModel] = useState("qwen3-coder:30b");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [brainProvider, setBrainProvider] = useState<ProviderType | null>(null);
  const [brainOnline, setBrainOnline] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  // Restore settings & detect provider on mount
  useEffect(() => {
    const storedModel = localStorage.getItem("meldex:ollamaModel");
    if (storedModel) setModel(storedModel);

    // Quick probe for brain provider info
    fetch("/api/models/test")
      .then((r) => r.json())
      .then((d: { status?: string; provider?: ProviderType }) => {
        if (d.provider) setBrainProvider(d.provider);
        setBrainOnline(d.status === "ok");
      })
      .catch(() => setBrainOnline(false));
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const createNewChat = useCallback(() => {
    const id = uid();
    const conv: Conversation = {
      id,
      title: "New chat",
      messages: [],
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(id);
    setError("");
  }, []);

  // Create initial chat on first load
  useEffect(() => {
    if (conversations.length === 0) createNewChat();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMessage() {
    const content = input.trim();
    if (!content || loading || !activeConvId) return;

    const userMsg: Message = { id: uid(), role: "user", content };
    let updatedMessages: Message[] = [];

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvId) return c;
        updatedMessages = [...c.messages, userMsg];
        const title =
          c.title === "New chat" ? content.slice(0, 40) + (content.length > 40 ? "…" : "") : c.title;
        return { ...c, title, messages: updatedMessages };
      })
    );
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data: { message?: string; error?: string; provider?: ProviderType } = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Chat request failed");

      if (data.provider) setBrainProvider(data.provider);

      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        content: data.message ?? "No response.",
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConvId ? { ...c, messages: [...c.messages, assistantMsg] } : c
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  const messages = activeConv?.messages ?? [];

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={setActiveConvId}
        onNew={createNewChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <BrainBadge provider={brainProvider} />
            {brainOnline !== null && (
              <span title={brainOnline ? "Brain online" : "Brain offline"}>
                {brainOnline ? (
                  <Wifi className="size-4 text-mint" />
                ) : (
                  <WifiOff className="size-4 text-red-400" />
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Model
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
              onClick={createNewChat}
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
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center gap-8 p-6 text-center">
              <div>
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-mint/10 text-mint">
                  <Bot className="size-7" />
                </div>
                <h2 className="text-xl font-semibold text-white">How can I help?</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Ask me to build, fix, explain, or plan anything.
                </p>
              </div>
              <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map((p) => {
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
            <div className="space-y-4 px-4 py-6 sm:px-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {loading && <TypingIndicator model={model} />}
              {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-white/10 bg-slate-900 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-end gap-3">
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
                placeholder="Message Meldex AI… (Shift+Enter for new line)"
                className="w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 transition focus:border-mint/60 focus:outline-none focus:ring-1 focus:ring-mint/40"
              />
            </div>
            <button
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-slate-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-600">
            Meldex AI can make mistakes. Review critical code before deploying.
          </p>
        </div>
      </div>
    </div>
  );
}

