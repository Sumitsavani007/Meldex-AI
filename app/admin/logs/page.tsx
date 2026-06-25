"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";

interface LogEntry {
  id: string;
  level: string;
  message: string;
  agent: string | null;
  createdAt: string;
}

export default function LogsPage() {
  const { data: session, status } = useSession();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  if (status === "loading") return null;
  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  useEffect(() => {
    fetch("/api/admin/logs")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setDbError(true); } else { setLogs(data.logs ?? []); }
      })
      .catch(() => setDbError(true))
      .finally(() => setLoading(false));
  }, []);

  const errors = logs.filter((l) => l.level === "error").length;
  const successRate = logs.length === 0 ? 100 : Math.round(((logs.length - errors) / logs.length) * 100);

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
                <p className="text-3xl font-bold text-white">{loading ? "…" : logs.length}</p>
              </div>
              <Clock className="w-8 h-8 text-slate-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Errors</p>
                <p className="text-3xl font-bold text-red-400">{loading ? "…" : errors}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Success Rate</p>
                <p className="text-3xl font-bold text-green-400">{loading ? "…" : `${successRate}%`}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400 opacity-20" />
            </div>
          </div>
        </div>

        {dbError && (
          <p className="text-xs text-amber-400 mb-4">
            Could not load log data — database may not be connected yet.
          </p>
        )}

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Logs</h2>
          {loading ? (
            <div className="text-center text-slate-400 py-8">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="text-center text-slate-400 py-12">No logs yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Level</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Agent</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Message</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          log.level === "error" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                          log.level === "warn" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                          "bg-green-500/20 text-green-400 border border-green-500/30"
                        }`}>
                          {log.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{log.agent ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-300 max-w-sm truncate">{log.message}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
