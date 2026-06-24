"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";

export default function AuditPage() {
  const { data: session } = useSession();

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

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">User Actions</h2>
            <Shield className="w-5 h-5 text-mint opacity-50" />
          </div>
          
          <div className="text-center text-slate-400 py-12">
            No audit logs yet
          </div>
        </div>
      </div>
    </div>
  );
}
