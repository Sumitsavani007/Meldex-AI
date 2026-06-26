"use client";

import { useState } from "react";

export default function DeviceConnectClient({ code, email }: { code: string; email: string }) {
  const [status, setStatus] = useState<"idle" | "approving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function approve() {
    setStatus("approving");
    setError("");
    const res = await fetch("/api/extensions/connect/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCode: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("error");
      setError(data.error || "Could not approve this code");
      return;
    }
    setStatus("done");
  }

  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-xl font-semibold">Connect Meldex AI</h1>
        <p className="mt-2 text-sm text-slate-400">Approve VS Code access for {email}.</p>
        <div className="mt-5 rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm">{code}</div>
        {status === "done" ? (
          <p className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Approved. Return to VS Code.</p>
        ) : (
          <button onClick={approve} disabled={status === "approving"} className="mt-5 w-full rounded-md bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
            {status === "approving" ? "Approving..." : "Approve VS Code"}
          </button>
        )}
        {error && <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      </div>
    </main>
  );
}
