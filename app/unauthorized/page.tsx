import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 text-slate-950 dark:bg-black dark:text-white">
      <div className="max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="rounded-full border border-red-600/20 bg-red-600/10 p-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Access Denied</h1>
        <p className="mb-6 text-slate-500 dark:text-slate-400">
          You do not have permission to access this resource. Only administrators can access this area.
        </p>
        <Link
          href="/dashboard"
          className="mx-focus inline-block rounded-lg bg-slate-950 px-6 py-2 font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
