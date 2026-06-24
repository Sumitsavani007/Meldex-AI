"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Lock, Smartphone, Shield, Key } from "lucide-react";

export default function SecuritySettingsPage() {
  const { data: session } = useSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Security Settings</h1>
          <p className="text-slate-400">Manage your account security and privacy</p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Lock className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Change Password</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Update your password to keep your account secure
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Change Password
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Smartphone className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Two-Factor Authentication</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Add an extra layer of security to your account with 2FA
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Enable 2FA
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Shield className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Active Sessions</h3>
                <p className="text-slate-400 text-sm mb-4">
                  View and manage your active login sessions
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Manage Sessions
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Key className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">API Keys</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Create and manage API keys for programmatic access
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Manage API Keys
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
