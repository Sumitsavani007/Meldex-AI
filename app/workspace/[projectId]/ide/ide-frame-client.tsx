"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, WifiOff } from "lucide-react";

type IdeSessionResponse = {
  url: string;
  expiresAt: string;
};

type IdeFrameClientProps = {
  projectId: string;
  projectName: string;
};

const progressSteps = ["Preparing workspace", "Starting Meldex IDE", "Connecting", "Ready"];

export function IdeFrameClient({ projectId, projectName }: IdeFrameClientProps) {
  const [session, setSession] = useState<IdeSessionResponse | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  const startIde = useCallback(async () => {
    setError("");
    setStep(0);
    try {
      const response = await fetch(`/api/workspaces/${projectId}/ide-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to start Meldex IDE");
      setSession({ url: data.url, expiresAt: data.expiresAt });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Meldex IDE");
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => (current < 2 ? current + 1 : current));
    }, 900);
    void startIde();
    return () => window.clearInterval(timer);
  }, [projectId, startIde]);

  return (
    <main className="flex h-screen min-h-0 bg-[#0B0D12] text-white">
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#22252D] bg-[#111318] px-4">
          <Link href="/workspace" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-white">
            <ArrowLeft className="size-4" />
            Workspaces
          </Link>
          <div className="min-w-0 flex-1 px-4 text-center">
            <p className="truncate text-sm font-semibold">Meldex IDE · {projectName}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
            {session?.expiresAt ? <span className="hidden sm:inline">Session expires {new Date(session.expiresAt).toLocaleTimeString()}</span> : null}
            {session?.url ? (
              <a href={session.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] px-3 py-1.5 text-sm font-medium text-white">
                Open full tab
                <ExternalLink className="size-4" />
              </a>
            ) : (
              <button disabled title="Meldex IDE is still preparing" className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-[#252838] px-3 py-1.5 text-sm font-medium text-[#9CA3AF]">
                Open full tab
              </button>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {session?.url ? (
            <iframe
              title={`${projectName} Meldex IDE`}
              src={session.url}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"
            />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top,rgba(124,92,255,0.24),transparent_35%),#0B0D12] px-6">
              <div className="w-full max-w-md rounded-2xl border border-[#22252D] bg-[#111318]/92 p-6 text-center shadow-2xl shadow-black/30 backdrop-blur">
                {error ? (
                  <>
                    <div className="mx-auto grid size-12 place-items-center rounded-xl bg-red-500/10 text-red-300">
                      <WifiOff className="size-5" />
                    </div>
                    <h1 className="mt-4 text-lg font-semibold">Meldex IDE could not connect</h1>
                    <p className="mt-2 text-sm leading-6 text-[#9CA3AF]">{error}</p>
                    <div className="mt-5 flex justify-center gap-2">
                      <button onClick={startIde} className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] px-4 py-2 text-sm font-semibold text-white">
                        <RefreshCw className="size-4" />
                        Retry
                      </button>
                      <Link href="/workspace" className="rounded-lg border border-[#22252D] px-4 py-2 text-sm font-semibold text-[#D1D5DB] hover:bg-[#1A1E27]">
                        Back to list
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mx-auto grid size-12 place-items-center rounded-xl bg-[#7C5CFF] text-white shadow-lg shadow-[#7C5CFF]/25">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                    <h1 className="mt-4 text-lg font-semibold">Opening Meldex IDE…</h1>
                    <p className="mt-2 text-sm text-[#9CA3AF]">{progressSteps[step]}</p>
                    <div className="mt-5 grid gap-2 text-left">
                      {progressSteps.map((label, index) => (
                        <div key={label} className="flex items-center gap-3 text-sm">
                          <span className={`size-2 rounded-full ${index <= step ? "bg-[#7C5CFF]" : "bg-[#343845]"}`} />
                          <span className={index <= step ? "text-white" : "text-[#6B7280]"}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
