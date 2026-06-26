"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Github, Chrome, KeyRound, Eye, EyeOff, ExternalLink, ShieldCheck } from "lucide-react";

type Tab = "password" | "token" | "oauth";

type LoginFormProps = {
  mode?: "user" | "master";
  title?: string;
  subtitle?: string;
  showRegisterLink?: boolean;
};

function safeRelativePath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function roleTarget(role: string | undefined, requested: string | null) {
  if (role === "OWNER") return "/admin/master";
  if (role === "ADMIN") return requested?.startsWith("/admin") ? requested : "/admin";
  if (requested && !requested.startsWith("/admin")) return requested;
  return "/dashboard";
}

export default function LoginForm({
  mode = "user",
  title = "Welcome back",
  subtitle = "Sign in to your Meldex AI account",
  showRegisterLink = true,
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(mode === "master" ? "oauth" : "password");

  // Email/password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // API token state
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [error, setError] = useState(
    mode === "master" && searchParams.get("error") === "not_master"
      ? "This Google account does not have master access. Choose the owner account."
      : ""
  );
  const [loading, setLoading] = useState(false);

  const requestedCallbackUrl = safeRelativePath(searchParams.get("callbackUrl"));
  const callbackUrl =
    mode === "master"
      ? "/auth/master-redirect"
      : requestedCallbackUrl
        ? `/auth/redirect?callbackUrl=${encodeURIComponent(requestedCallbackUrl)}`
        : "/auth/redirect";

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.ok) {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionRes.json().catch(() => null);
      if (mode === "master" && session?.user?.role !== "OWNER" && session?.user?.role !== "ADMIN") {
        setError("This account does not have master access.");
        return;
      }
      router.replace(mode === "master" ? "/admin/master" : roleTarget(session?.user?.role, requestedCallbackUrl));
      router.refresh();
    } else {
      setError(result?.error || "Invalid email or password");
    }
  };

  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const trimmed = apiToken.trim();
    if (!trimmed.startsWith("mdx_")) {
      setError("API token must start with mdx_");
      setLoading(false);
      return;
    }
    const result = await signIn("api-token", { token: trimmed, redirect: false });
    setLoading(false);
    if (result?.ok) {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionRes.json().catch(() => null);
      if (mode === "master" && session?.user?.role !== "OWNER" && session?.user?.role !== "ADMIN") {
        setError("This account does not have master access.");
        return;
      }
      router.replace(mode === "master" ? "/admin/master" : roleTarget(session?.user?.role, requestedCallbackUrl));
      router.refresh();
    } else {
      setError(result?.error || "Invalid or expired API token");
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "password", label: "Email", icon: <Mail className="w-3.5 h-3.5" /> },
    { id: "token",    label: "API Token", icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: "oauth",    label: "OAuth", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-[#0b0f17] dark:text-white">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] lg:grid-cols-[1fr_420px]">
        <div className="hidden border-r border-slate-200 bg-slate-50 p-8 dark:border-white/[0.08] dark:bg-white/[0.02] lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <ShieldCheck className="size-5" />
            </div>
            <h2 className="mt-6 max-w-sm text-3xl font-semibold tracking-tight">
              {mode === "master" ? "Master control access." : "Continue to Meldex workspace."}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
              {mode === "master"
                ? "Manage providers, vault, runtime diagnostics, users, and deployment settings from the new control center."
                : "Use Google, email, or an access token to open chat, agent workspace, token settings, and live backend tools."}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-400">
            {["Google sign-in", "Access token login", "Chat and agent access"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full">

          {/* Header */}
          <div className="border-b border-slate-200 px-8 pb-6 pt-8 text-center dark:border-white/[0.08]">
            <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <span className="text-xl font-bold">M</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>

          {/* Tabs */}
          <div className="px-8 pt-6">
            <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
              {TABS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); setError(""); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-200 ${
                    tab === id
                      ? "border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-white/[0.08] dark:bg-white dark:text-slate-950"
                      : "text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-8 pb-8 pt-5">
            {/* Error */}
            {error && (
              <div className="mb-5 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* ── Email / Password Tab ── */}
            {tab === "password" && (
              <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-950 placeholder-slate-400 transition focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-slate-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-xs font-medium text-slate-300 uppercase tracking-wide">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs text-mint/70 hover:text-mint transition">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      id="password"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-950 placeholder-slate-400 transition focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-slate-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-md bg-slate-950 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {loading ? "Signing in…" : "Sign In"}
                </button>
              </form>
            )}

            {/* ── API Token Tab ── */}
            {tab === "token" && (
              <form onSubmit={handleTokenLogin} className="space-y-4">
                {/* Info box */}
                <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-sm font-semibold text-amber-300">Where to get your API token?</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    API tokens let you sign in without a password — ideal for scripts and CI/CD.
                    Tokens are generated from your account settings.
                  </p>
                  <Link
                    href="/settings/tokens"
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 font-medium transition"
                  >
                    Settings → API Tokens
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                  <p className="text-xs text-slate-500">
                    (You must be signed in to generate a token — use Email or OAuth tab first for new accounts.)
                  </p>
                </div>

                <div>
                  <label htmlFor="apitoken" className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    API Token
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      id="apitoken"
                      type={showToken ? "text" : "password"}
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="mdx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-10 pr-10 font-mono text-sm text-slate-950 placeholder-slate-400 transition focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-slate-500"
                      required
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">Tokens start with <code className="text-amber-400/80 bg-slate-900/60 px-1 rounded">mdx_</code></p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !apiToken.trim()}
                  className="mt-2 w-full rounded-md border border-amber-500/30 bg-amber-500/15 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/25 disabled:opacity-40 dark:text-amber-300"
                >
                  {loading ? "Verifying token…" : "Sign In with API Token"}
                </button>
              </form>
            )}

            {/* ── OAuth Tab ── */}
            {tab === "oauth" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 text-center mb-4">
                  Sign in with your existing account — no password required.
                </p>

                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl })}
                  className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
                >
                  <Chrome className="w-4 h-4 text-blue-400" />
                  Continue with Google
                </button>

                <button
                  type="button"
                  onClick={() => signIn("github", { callbackUrl })}
                  className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
                >
                  <Github className="w-4 h-4" />
                  Continue with GitHub
                </button>

                <p className="text-xs text-slate-500 text-center pt-2">
                  By signing in you agree to our{" "}
                  <Link href="/terms" className="text-slate-400 hover:text-slate-300 underline underline-offset-2">Terms</Link>
                  {" & "}
                  <Link href="/privacy" className="text-slate-400 hover:text-slate-300 underline underline-offset-2">Privacy Policy</Link>.
                </p>
              </div>
            )}

            {/* Footer */}
            {showRegisterLink && (
              <p className="text-center text-slate-500 text-xs mt-6">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="text-mint hover:text-mint/80 font-medium transition">
                  Create account
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
