"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Github, Chrome, KeyRound, Eye, EyeOff, ExternalLink, ShieldCheck } from "lucide-react";

type Tab = "password" | "token" | "oauth";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("password");

  // Email/password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // API token state
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.ok) {
      router.push(callbackUrl);
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
      router.push(callbackUrl);
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
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-800/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-white/5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-mint/10 border border-mint/20 mb-4">
              <span className="text-mint font-bold text-xl">M</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-slate-400 text-sm mt-1">Sign in to your Meldex AI account</p>
          </div>

          {/* Tabs */}
          <div className="px-8 pt-6">
            <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 border border-white/5">
              {TABS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); setError(""); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-200 ${
                    tab === id
                      ? "bg-mint/20 text-mint border border-mint/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
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
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5 text-red-300 text-sm flex items-start gap-2">
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
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-700/40 border border-slate-600/60 hover:border-slate-500/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50 focus:ring-1 focus:ring-mint/20 transition text-sm"
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
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-700/40 border border-slate-600/60 hover:border-slate-500/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50 focus:ring-1 focus:ring-mint/20 transition text-sm"
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
                  className="w-full bg-mint/20 hover:bg-mint/30 disabled:opacity-50 text-mint border border-mint/40 font-semibold py-2.5 rounded-lg transition-all mt-2 text-sm"
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
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-700/40 border border-slate-600/60 hover:border-slate-500/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition text-sm font-mono"
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
                  className="w-full bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-300 border border-amber-500/30 font-semibold py-2.5 rounded-lg transition-all mt-2 text-sm"
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
                  className="w-full flex items-center justify-center gap-3 bg-slate-700/40 hover:bg-slate-600/50 text-white border border-slate-600/60 hover:border-slate-500 font-medium py-2.5 rounded-lg transition text-sm"
                >
                  <Chrome className="w-4 h-4 text-blue-400" />
                  Continue with Google
                </button>

                <button
                  type="button"
                  onClick={() => signIn("github", { callbackUrl })}
                  className="w-full flex items-center justify-center gap-3 bg-slate-700/40 hover:bg-slate-600/50 text-white border border-slate-600/60 hover:border-slate-500 font-medium py-2.5 rounded-lg transition text-sm"
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
            <p className="text-center text-slate-500 text-xs mt-6">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-mint hover:text-mint/80 font-medium transition">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.ok) {
      router.push(callbackUrl);
    } else {
      setError(result?.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Meldex AI</h1>
            <p className="text-slate-400">Sign in to your account</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-6 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleCredentialsLogin} className="space-y-4 mb-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mint/20 hover:bg-mint/30 disabled:opacity-50 text-mint border border-mint/50 font-medium py-2 rounded-lg transition mt-6"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800/50 text-slate-400">Or continue with</span>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl })}
              className="w-full flex items-center justify-center gap-2 bg-slate-700/50 hover:bg-slate-600/50 text-white border border-slate-600 font-medium py-2 rounded-lg transition"
            >
              <Chrome className="w-4 h-4" />
              Google
            </button>

            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl })}
              className="w-full flex items-center justify-center gap-2 bg-slate-700/50 hover:bg-slate-600/50 text-white border border-slate-600 font-medium py-2 rounded-lg transition"
            >
              <Github className="w-4 h-4" />
              GitHub
            </button>
          </div>

          <p className="text-center text-slate-400 text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-mint hover:text-mint/80 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
