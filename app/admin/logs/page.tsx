"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";

export default function LogsPage() {
  const { data: session } = useSession();

  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">System Logs</h1>
          <p className="text-slate-400">View agent and execution logs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Logs</p>
                <p className="text-3xl font-bold text-white">0</p>
              </div>
              <Clock className="w-8 h-8 text-slate-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Errors</p>
                <p className="text-3xl font-bold text-red-400">0</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Success Rate</p>
                <p className="text-3xl font-bold text-green-400">100%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400 opacity-20" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Logs</h2>
          <div className="text-center text-slate-400 py-12">
            No logs yet
          </div>
        </div>
      </div>
    </div>
  );
}
