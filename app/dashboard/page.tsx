"use client";

import Link from "next/link";
import { ArrowUp, Paperclip, Sparkles } from "lucide-react";

const suggestions = [
  "Draft a landing page for my product",
  "Explain this codebase architecture",
  "Create a project plan",
  "Summarize my recent work",
];

export default function DashboardPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-white text-slate-950 dark:bg-[#0d0d0d] dark:text-white">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <div className="mb-8 grid size-11 place-items-center rounded-2xl bg-slate-100 dark:bg-[#171717]">
          <Sparkles className="size-5 text-slate-600 dark:text-[#a1a1aa]" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How can I help?</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-[#a1a1aa]">
          Start a conversation, work on a project, or continue from your chat history.
        </p>

        <Link
          href="/chat"
          className="mx-focus mt-8 flex w-full max-w-2xl items-center gap-3 rounded-[24px] border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 dark:border-[#262626] dark:bg-[#171717] dark:hover:bg-[#202020]"
        >
          <span className="grid size-9 place-items-center rounded-full text-slate-500 dark:text-[#a1a1aa]">
            <Paperclip className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-[15px] text-slate-500 dark:text-[#a1a1aa]">Message Meldex AI</span>
          <span className="grid size-9 place-items-center rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <ArrowUp className="size-4" />
          </span>
        </Link>

        <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          {suggestions.map((suggestion) => (
            <Link
              key={suggestion}
              href="/chat"
              className="mx-focus rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:border-[#262626] dark:text-[#a1a1aa] dark:hover:bg-[#202020] dark:hover:text-white"
            >
              {suggestion}
            </Link>
          ))}
        </div>
      </main>
      <footer className="px-4 pb-5 text-center text-xs text-slate-400 dark:text-[#71717a]">
        Meldex can make mistakes. Review important output.
      </footer>
    </div>
  );
}
