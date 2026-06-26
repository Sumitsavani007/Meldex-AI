"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, Github, Chrome } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, confirmPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Registration failed");
      } else {
        // Sign in after registration
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.ok) {
          router.push("/dashboard");
        } else {
          setError("Registration successful, but login failed. Please try signing in.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-slate-950 dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-center mb-8">
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Meldex AI</h1>
            <p className="text-slate-500 dark:text-slate-400">Create your account</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-600/20 bg-red-600/10 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4 mb-6">
            <div>
              <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="mx-focus w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-slate-950 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
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
                  className="mx-focus w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-slate-950 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="mx-focus w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-slate-950 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="mx-focus w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-slate-950 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mx-focus mt-6 w-full rounded-lg bg-slate-950 py-2 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-slate-500 dark:bg-[#0c0c0f] dark:text-slate-400">Or continue with</span>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="mx-focus flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              <Chrome className="w-4 h-4" />
              Google
            </button>

            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              className="mx-focus flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              <Github className="w-4 h-4" />
              GitHub
            </button>
          </div>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
