"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Settings, Lock, Bell } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Settings</h1>
          <p className="text-slate-400">Configure system-wide settings</p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Lock className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Security</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Configure rate limiting, IP whitelisting, and security policies
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Configure
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Bell className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Notifications</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Set up email alerts and notification preferences
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Configure
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Settings className="w-5 h-5 text-mint mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">System Configuration</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Configure API rate limits, storage limits, and feature flags
                </p>
                <button className="px-4 py-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 rounded-lg transition text-sm font-medium">
                  Configure
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
