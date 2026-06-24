"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Github, Chrome } from "lucide-react";

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
