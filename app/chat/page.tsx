"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, UserRound } from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const defaultBaseUrl = "http://localhost:11434";
const defaultModel = "qwen3-coder:30b";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Ready. Tell me what you want to build, fix, or deploy." }
  ]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBaseUrl(localStorage.getItem("meldex:ollamaBaseUrl") || defaultBaseUrl);
    setModel(localStorage.getItem("meldex:ollamaModel") || defaultModel);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || loading) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, model, messages: nextMessages })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Chat request failed");
      }

      setMessages((current) => [...current, { role: "assistant", content: data.message || "No response content." }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionShell className="flex min-h-[calc(100vh-72px)] flex-col py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-mint">Ollama Chat</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">AI Chat</h1>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Model
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="rounded-md border-white/10 bg-slate-950 text-sm text-slate-100 focus:border-mint focus:ring-mint"
          >
            <option value="qwen3-coder:30b">qwen3-coder:30b</option>
            <option value="qwen2.5-coder:32b">qwen2.5-coder:32b</option>
            <option value="llama3.1:8b">llama3.1:8b</option>
            <option value={model}>{model}</option>
          </select>
        </label>
      </div>

      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="thin-scrollbar flex-1 space-y-4 overflow-auto p-4 sm:p-6">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-mint/10 text-mint">
                  <Bot className="size-4" />
                </span>
              )}
              <div className={`max-w-[840px] rounded-md border px-4 py-3 text-sm leading-6 ${message.role === "user" ? "border-mint/20 bg-mint/10 text-slate-100" : "border-white/10 bg-white/[0.04] text-slate-200"}`}>
                <pre className="whitespace-pre-wrap break-words font-sans">{message.content}</pre>
              </div>
              {message.role === "user" && (
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-iris/10 text-iris">
                  <UserRound className="size-4" />
                </span>
              )}
            </div>
          ))}
          {loading && <StatusPill tone="idle">Thinking with {model}...</StatusPill>}
          {error && <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask Meldex AI to build, fix, explain, or plan..."
              className="min-h-12 flex-1 resize-none rounded-md border-white/10 bg-slate-950 text-sm text-slate-100 focus:border-mint focus:ring-mint"
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="grid size-12 shrink-0 place-items-center rounded-md bg-mint text-slate-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="size-5" />
            </button>
          </div>
        </div>
      </Panel>
    </SectionShell>
  );
}
