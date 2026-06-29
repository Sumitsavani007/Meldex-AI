"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  Github,
  Mail,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";

const suggestedPrompts = [
  "Build a premium landing page",
  "Create a project plan",
  "Review my code structure",
  "Explain an idea simply",
];

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [guestTurns, setGuestTurns] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [guestMessages, setGuestMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string }[]
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const guestLimit = 2;
  const guestRemaining = Math.max(guestLimit - guestTurns, 0);
  const canContinueAsGuest = guestRemaining > 0;

  useEffect(() => {
    const storedTurns = Number(localStorage.getItem("meldex:guestTurns") || "0");
    const storedMessages = localStorage.getItem("meldex:guestMessages");
    if (Number.isFinite(storedTurns)) setGuestTurns(storedTurns);
    if (storedMessages) {
      try {
        setGuestMessages(JSON.parse(storedMessages));
      } catch {
        localStorage.removeItem("meldex:guestMessages");
      }
    }
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [prompt]);

  const guestStatus = useMemo(() => {
    if (!canContinueAsGuest) return "Sign in to continue with live Meldex AI.";
    return `${guestRemaining} guest ${guestRemaining === 1 ? "message" : "messages"} remaining`;
  }, [canContinueAsGuest, guestRemaining]);

  function submitGuestPrompt(value?: string) {
    const content = (value ?? prompt).trim();
    if (!content) return;
    if (!canContinueAsGuest) {
      setShowLoginModal(true);
      return;
    }

    const nextTurns = guestTurns + 1;
    const nextMessages = [
      ...guestMessages,
      { id: crypto.randomUUID(), role: "user" as const, content },
      {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content:
          "I can help with this. Sign in to run the full Meldex AI engine, save the conversation, and continue with projects, AI Studio, and cloud sync.",
      },
    ];
    setGuestTurns(nextTurns);
    setGuestMessages(nextMessages);
    setPrompt("");
    localStorage.setItem("meldex:guestTurns", String(nextTurns));
    localStorage.setItem("meldex:guestMessages", JSON.stringify(nextMessages));
    if (nextTurns >= guestLimit) setShowLoginModal(true);
  }

  return (
    <div className="flex min-h-[calc(100vh-58px)] flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.10),transparent_34%),#ffffff] text-slate-950 dark:bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.20),transparent_34%),#0d0d0d] dark:text-white">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <div className="mb-7 grid size-12 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#171717]">
          <Bot className="size-6 text-slate-700 dark:text-[#a1a1aa]" />
        </div>
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-[#71717a]">
          <Sparkles className="size-3.5" />
          Meldex AI
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">What can we build today?</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500 dark:text-[#a1a1aa] sm:text-base">
          Start in guest mode, then sign in when you are ready to save chats, projects, AI Studio work, and cloud history.
        </p>

        <div className="mt-8 w-full max-w-3xl">
          {guestMessages.length > 0 && (
            <div className="mb-4 space-y-3 text-left">
              {guestMessages.slice(-4).map((message) => (
                <div
                  key={message.id}
                  className={[
                    "rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm",
                    message.role === "user"
                      ? "ml-auto max-w-[82%] bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                      : "mr-auto max-w-[88%] border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-[#171717] dark:text-slate-200",
                  ].join(" ")}
                >
                  {message.content}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-[28px] border border-slate-200 bg-white p-2 text-left shadow-[0_20px_80px_rgba(15,23,42,0.08)] transition dark:border-[#262626] dark:bg-[#171717] dark:shadow-none">
            <textarea
              ref={textareaRef}
              value={prompt}
              rows={1}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitGuestPrompt();
                }
              }}
              placeholder="Message Meldex AI..."
              className="mx-focus max-h-[180px] min-h-12 w-full resize-none border-0 bg-transparent px-4 py-3 text-[15px] leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-[#71717a]"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#71717a]">
                <span className="grid size-8 place-items-center rounded-full text-slate-400">
                  <Paperclip className="size-4" />
                </span>
                <span>{guestStatus}</span>
              </div>
              <button
                type="button"
                onClick={() => submitGuestPrompt()}
                disabled={!prompt.trim()}
                className="mx-focus grid size-10 place-items-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                aria-label="Send guest message"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setPrompt(prompt);
                textareaRef.current?.focus();
              }}
              className="mx-focus rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm text-slate-600 transition hover:bg-white hover:text-slate-950 dark:border-[#262626] dark:bg-[#171717]/70 dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="mx-focus rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Open full chat
          </Link>
          <Link
            href="/login"
            className="mx-focus rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-[#262626] dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="mx-focus rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Get Started
          </Link>
        </div>
      </main>
      <footer className="px-4 pb-5 text-center text-xs text-slate-400 dark:text-[#71717a]">
        Meldex can make mistakes. Review important output.
      </footer>

      {showLoginModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 px-4 backdrop-blur-xl">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-white/92 p-5 text-left shadow-2xl shadow-slate-950/20 dark:bg-[#111111]/92">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Continue with Meldex</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Save your work and keep going.</h2>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="mx-focus grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Close login dialog"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              {["Save Chats", "AI Studio", "Projects", "History", "Cloud Sync"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <Check className="size-4 text-violet-600 dark:text-violet-300" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-2">
              <button
                onClick={() => signIn("google", { callbackUrl: "/chat" })}
                className="mx-focus flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Continue with Google
              </button>
              <button
                onClick={() => signIn("github", { callbackUrl: "/chat" })}
                className="mx-focus flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                <Github className="size-4" />
                Continue with GitHub
              </button>
              <Link
                href="/login?callbackUrl=/chat"
                className="mx-focus flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                <Mail className="size-4" />
                Continue with Email
              </Link>
              {canContinueAsGuest && (
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="mx-focus h-10 rounded-xl text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  Continue as Guest
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
