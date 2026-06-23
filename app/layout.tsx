import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Github, LayoutDashboard, MessageSquare, Settings, TerminalSquare } from "lucide-react";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Meldex AI | Build. Fix. Deploy.",
  description: "A Codex-style local AI coding agent dashboard powered by Ollama."
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/workspace", label: "Workspace", icon: TerminalSquare },
  { href: "/settings", label: "Settings", icon: Settings }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans antialiased">
        <div className="pointer-events-none fixed inset-0 grid-sheen opacity-45" />
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/84 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-md border border-mint/25 bg-mint/10 shadow-glow">
                  <Bot className="size-5 text-mint" />
                </span>
                <span>
                  <span className="block text-sm font-semibold tracking-wide text-white">Meldex AI</span>
                  <span className="block text-xs text-slate-400">Build. Fix. Deploy.</span>
                </span>
              </Link>
              <nav className="hidden items-center gap-1 md:flex">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/7 hover:text-white"
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <Link
                  href="/chat"
                  className={cn(
                    "hidden items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/7 sm:flex"
                  )}
                >
                  <Github className="size-4" />
                  Login
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-md bg-mint px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-mint/90"
                >
                  Dashboard
                </Link>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
