"use client";

import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
