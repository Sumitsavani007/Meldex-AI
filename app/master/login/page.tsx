import { Suspense } from "react";
import LoginForm from "@/app/login/login-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MasterLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink via-slate-900 to-slate-800 text-slate-400">
          Loading...
        </div>
      }
    >
      <LoginForm
        mode="master"
        title="Master Control"
        subtitle="Sign in with the owner account to manage Meldex."
        showRegisterLink={false}
      />
    </Suspense>
  );
}
