"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { BarChart3, TrendingUp, Zap, Coins } from "lucide-react";

export default function UsagePage() {
  const { data: session } = useSession();

  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">AI Usage Analytics</h1>
          <p className="text-slate-400">Monitor model and token usage</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Tokens</p>
                <p className="text-3xl font-bold text-white">0</p>
              </div>
              <Coins className="w-8 h-8 text-mint opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Agent Runs</p>
                <p className="text-3xl font-bold text-white">0</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">API Calls</p>
                <p className="text-3xl font-bold text-white">0</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Cost</p>
                <p className="text-3xl font-bold text-white">$0</p>
              </div>
              <BarChart3 className="w-8 h-8 text-green-400 opacity-20" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Top Models</h2>
            <div className="text-center text-slate-400 py-12">
              No usage data yet
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Provider Breakdown</h2>
            <div className="text-center text-slate-400 py-12">
              No usage data yet
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
