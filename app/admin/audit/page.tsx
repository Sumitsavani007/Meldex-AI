"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  resource: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { email: string } | null;
}

export default function AuditPage() {
  const { data: session, status } = useSession();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setDbError(true); } else { setLogs(data.logs ?? []); }
      })
      .catch(() => setDbError(true))
      .finally(() => setLoading(false));
  }, []);

  if (status === "loading") return null;
  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Audit Logs</h1>
          <p className="text-slate-400">Track all user and admin actions</p>
        </div>

        {dbError && (
          <p className="text-xs text-amber-400 mb-4">
            Could not load audit data — database may not be connected yet.
          </p>
        )}

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">User Actions</h2>
            <Shield className="w-5 h-5 text-mint opacity-50" />
          </div>

          {loading ? (
            <div className="text-center text-slate-400 py-8">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="text-center text-slate-400 py-12">No audit logs yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-slate-300 font-semibold">User</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Action</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Resource</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">IP</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-slate-300">{log.user?.email ?? "system"}</td>
                      <td className="px-4 py-3 text-white font-mono text-xs">{log.action}</td>
                      <td className="px-4 py-3 text-slate-400">{log.resource ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{log.ipAddress ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400">
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
