import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-red-500/20 border border-red-500/50">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 mb-6">
          You do not have permission to access this resource. Only administrators can access this area.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 font-medium py-2 px-6 rounded-lg transition"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
