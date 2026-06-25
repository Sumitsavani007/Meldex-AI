"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { Package, Archive, TrendingUp } from "lucide-react";

interface ProjectData {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  user: { email: string; name: string | null } | null;
}

interface Stats {
  total: number;
  active: number;
  archived: number;
  projects: ProjectData[];
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, archived: 0, projects: [] });
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/projects")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setDbError(true); } else { setStats(data); }
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
          <h1 className="text-3xl font-bold text-white mb-2">Project Management</h1>
          <p className="text-slate-400">Monitor and manage user projects</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Projects</p>
                <p className="text-3xl font-bold text-white">{loading ? "…" : stats.total}</p>
              </div>
              <Package className="w-8 h-8 text-mint opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Active Projects</p>
                <p className="text-3xl font-bold text-white">{loading ? "…" : stats.active}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Archived</p>
                <p className="text-3xl font-bold text-white">{loading ? "…" : stats.archived}</p>
              </div>
              <Archive className="w-8 h-8 text-slate-400 opacity-20" />
            </div>
          </div>
        </div>

        {dbError && (
          <p className="text-xs text-amber-400 mb-4">
            Could not load project data — database may not be connected yet.
          </p>
        )}

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Projects</h2>
          {loading ? (
            <div className="text-center text-slate-400 py-8">Loading…</div>
          ) : stats.projects.length === 0 ? (
            <div className="text-center text-slate-400 py-12">No projects yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Name</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Owner</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Status</th>
                    <th className="px-4 py-3 text-slate-300 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {stats.projects.map((p) => (
                    <tr key={p.id} className="hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-white">{p.name}</td>
                      <td className="px-4 py-3 text-slate-300">{p.user?.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          p.status === "ACTIVE" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                          p.status === "ARCHIVED" ? "bg-slate-700 text-slate-400 border border-slate-600" :
                          "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(p.createdAt).toLocaleDateString()}
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
