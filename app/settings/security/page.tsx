"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { KeyRound, Lock, Shield, Smartphone } from "lucide-react";

export default function SecuritySettingsPage() {
  const { data: session } = useSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-white p-8 text-slate-950 dark:bg-black dark:text-white">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Security Settings</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage your account security and privacy</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-start gap-4">
              <Lock className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500" />
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-semibold text-slate-950 dark:text-white">Change Password</h3>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Update your password to keep your account secure
                </p>
                <button className="mx-focus rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                  Change Password
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-start gap-4">
              <Smartphone className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500" />
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-semibold text-slate-950 dark:text-white">Two-Factor Authentication</h3>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Add an extra layer of security to your account with 2FA
                </p>
                <button className="mx-focus rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]">
                  Enable 2FA
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-start gap-4">
              <Shield className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500" />
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-semibold text-slate-950 dark:text-white">Active Sessions</h3>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  View and manage your active login sessions
                </p>
                <button className="mx-focus rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]">
                  Manage Sessions
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-start gap-4">
              <KeyRound className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500" />
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-semibold text-slate-950 dark:text-white">Recovery Options</h3>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Keep your recovery email and account backup options current
                </p>
                <button className="mx-focus rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]">
                  Review Recovery
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
