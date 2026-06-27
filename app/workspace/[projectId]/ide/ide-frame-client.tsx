"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, CheckCircle2, ExternalLink, FileCode2, Loader2, Paperclip, RefreshCw, Send, Square, WifiOff } from "lucide-react";

type IdeSessionResponse = {
  url: string;
  expiresAt: string;
};

type IdeFrameClientProps = {
  projectId: string;
  projectName: string;
  projectCreatedAt: string;
};

const progressSteps = ["Preparing workspace", "Starting Meldex IDE", "Connecting", "Ready"];

type StreamEvent = {
  sequence: number;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
};

type WorkspaceSummary = {
  project?: { lastPreviewUrl?: string | null };
  tree?: Array<{ path: string; type: string; status?: string }>;
  tasks?: Array<{ id: string; status: string; prompt: string; events?: StreamEvent[]; diffs?: Array<{ path: string; added: number; removed: number }> }>;
};

export function IdeFrameClient({ projectId, projectName, projectCreatedAt }: IdeFrameClientProps) {
  const [session, setSession] = useState<IdeSessionResponse | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [setupVisible, setSetupVisible] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [agentMessage, setAgentMessage] = useState("Ready");
  const [lastPrompt, setLastPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "activity" | "files">("chat");
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const loadWorkspace = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${projectId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setWorkspace(data);
  }, [projectId]);

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
    void loadWorkspace();
    return () => window.clearInterval(timer);
  }, [projectId, startIde, loadWorkspace]);

  useEffect(() => {
    const createdAt = new Date(projectCreatedAt).getTime();
    const isBrandNew = Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60 * 1000;
    const key = `meldex:ide:onboarding:${projectId}`;
    if (isBrandNew && window.localStorage.getItem(key) !== "dismissed") {
      setSetupVisible(true);
    }
  }, [projectCreatedAt, projectId]);

  function dismissSetup() {
    window.localStorage.setItem(`meldex:ide:onboarding:${projectId}`, "dismissed");
    setSetupVisible(false);
  }

  const runAgent = useCallback(async (prompt = agentPrompt) => {
    const effectivePrompt = prompt.trim();
    if (!effectivePrompt || running) return;
    const controller = new AbortController();
    setAbortController(controller);
    setRunning(true);
    setLastPrompt(effectivePrompt);
    setAgentMessage("Starting Meldex AI");
    setEvents([]);
    try {
      const response = await fetch(`/api/workspaces/${projectId}/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effectivePrompt }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({ error: "Unable to start Meldex AI" }));
        throw new Error(data.error || "Unable to start Meldex AI");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6)) as StreamEvent;
          setEvents((current) => [...current, event].sort((a, b) => a.sequence - b.sequence));
          setAgentMessage(event.message);
          if (["file_created", "file_updated", "file_deleted", "diff_ready", "preview_verified", "done", "finalized"].includes(event.type)) {
            void loadWorkspace();
          }
        }
      }
      setAgentPrompt("");
      await loadWorkspace();
    } catch (err) {
      setAgentMessage(controller.signal.aborted ? "Stopped" : err instanceof Error ? err.message : "Meldex AI failed");
    } finally {
      setRunning(false);
      setAbortController(null);
    }
  }, [agentPrompt, loadWorkspace, projectId, running]);

  function stopAgent() {
    abortController?.abort();
    setRunning(false);
    setAgentMessage("Stopped");
  }

  const files = workspace?.tree?.filter((node) => node.type !== "directory").slice(0, 12) || [];
  const lastTask = workspace?.tasks?.[0];
  const changedFiles = lastTask?.diffs || [];

  return (
    <main className="flex h-screen min-h-0 bg-[#0B0D12] text-white">
      <section className="flex min-w-0 flex-1 flex-col">
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
            <>
              <iframe
                title={`${projectName} Meldex IDE`}
                src={session.url}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"
              />
              {setupVisible ? (
                <div className="absolute inset-0 z-20 grid place-items-center bg-[#0B0D12]/72 p-6 backdrop-blur-sm">
                  <div className="w-full max-w-lg rounded-2xl border border-[#2A2E39] bg-[#111318] p-6 shadow-2xl shadow-black/40">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-[#7C5CFF]">
                        <Bot className="size-5" />
                      </span>
                      <div>
                        <h2 className="text-lg font-semibold">Welcome to Meldex IDE</h2>
                        <p className="text-sm text-[#9CA3AF]">Set up this workspace once, then jump straight back in next time.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 text-sm">
                      {["Choose theme", "Open project files", "Ask Meldex AI", "Run preview"].map((label, index) => (
                        <div key={label} className="flex items-center gap-3 rounded-xl border border-[#22252D] bg-[#0B0D12] p-3">
                          <span className="grid size-6 place-items-center rounded-full bg-[#7C5CFF]/15 text-xs text-[#C4B5FD]">{index + 1}</span>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                      <button onClick={dismissSetup} className="rounded-lg border border-[#2A2E39] px-4 py-2 text-sm font-semibold text-[#D1D5DB] hover:bg-[#1A1E27]">Skip</button>
                      <button onClick={dismissSetup} className="rounded-lg bg-[#7C5CFF] px-4 py-2 text-sm font-semibold text-white">Open Meldex IDE</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
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
      <aside className="hidden w-[360px] shrink-0 border-l border-[#22252D] bg-[#111318] xl:flex xl:flex-col">
        <div className="flex h-11 items-center justify-between border-b border-[#22252D] px-4">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-[#A78BFA]" />
            <span className="text-sm font-semibold">Meldex AI</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void loadWorkspace()} className="grid size-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#1A1E27]" title="Refresh status">
              <RefreshCw className="size-4" />
            </button>
            {running ? (
              <button onClick={stopAgent} className="grid size-8 place-items-center rounded-lg text-red-300 hover:bg-red-500/10" title="Stop Meldex AI">
                <Square className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex border-b border-[#22252D] px-3 pt-2">
          {(["chat", "activity", "files"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${activeTab === tab ? "border-b-2 border-[#7C5CFF] text-white" : "text-[#9CA3AF] hover:text-white"}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activeTab === "chat" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#22252D] bg-[#0B0D12] p-4">
                <p className="text-sm text-[#D1D5DB]">{agentMessage}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-[#9CA3AF]">
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  <span>{running ? "Streaming from Meldex backend" : "Connected to workspace agent"}</span>
                </div>
              </div>
              <div className="space-y-2">
                {events.slice(-8).map((event) => (
                  <div key={`${event.sequence}-${event.type}`} className="rounded-xl border border-[#22252D] bg-[#0B0D12] px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-[#7C5CFF]">{event.type.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm text-[#D1D5DB]">{event.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === "activity" ? (
            <div className="space-y-2">
              {(lastTask?.events || events).slice(-20).map((event) => (
                <div key={`${event.sequence}-${event.type}`} className="flex gap-3 rounded-xl px-2 py-2 hover:bg-[#1A1E27]">
                  <span className="mt-1 size-2 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-sm text-[#D1D5DB]">{event.message}</p>
                    <p className="text-xs text-[#6B7280]">{event.type}</p>
                  </div>
                </div>
              ))}
              {!lastTask?.events?.length && !events.length ? <p className="text-sm text-[#6B7280]">Activity appears when Meldex AI runs.</p> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Generated files</h3>
                <div className="mt-2 space-y-1">
                  {files.map((file) => (
                    <div key={file.path} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#D1D5DB] hover:bg-[#1A1E27]">
                      <FileCode2 className="size-4 text-[#A78BFA]" />
                      <span className="truncate">{file.path}</span>
                    </div>
                  ))}
                  {!files.length ? <p className="rounded-xl border border-[#22252D] p-3 text-sm text-[#6B7280]">No files yet.</p> : null}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Changes</h3>
                <div className="mt-2 space-y-1">
                  {changedFiles.map((file) => (
                    <div key={file.path} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-[#D1D5DB]">
                      <span className="truncate">{file.path}</span>
                      <span className="text-xs text-emerald-300">+{file.added} -{file.removed}</span>
                    </div>
                  ))}
                  {!changedFiles.length ? <p className="text-sm text-[#6B7280]">No changes yet.</p> : null}
                </div>
              </div>
              <div className="rounded-xl border border-[#22252D] bg-[#0B0D12] p-3">
                <p className="text-xs uppercase tracking-wide text-[#9CA3AF]">Preview</p>
                <p className="mt-1 truncate text-sm text-[#D1D5DB]">{workspace?.project?.lastPreviewUrl || "Not generated yet"}</p>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-[#22252D] p-3">
          <div className="rounded-2xl border border-[#2A2E39] bg-[#0B0D12] p-2">
            <textarea
              value={agentPrompt}
              onChange={(event) => setAgentPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey || event.key === "Enter") && !event.shiftKey) {
                  event.preventDefault();
                  void runAgent();
                }
              }}
              rows={3}
              className="w-full resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-[#6B7280]"
              placeholder="Ask Meldex AI to build, fix, or improve..."
            />
            <div className="flex items-center justify-between">
              <button disabled title="Attach context is automatic for this workspace" className="grid size-8 cursor-not-allowed place-items-center rounded-lg text-[#6B7280]">
                <Paperclip className="size-4" />
              </button>
              <div className="flex gap-2">
                <button onClick={() => lastPrompt && void runAgent(lastPrompt)} disabled={running || !lastPrompt} className="rounded-lg border border-[#2A2E39] px-3 py-1.5 text-xs font-semibold text-[#D1D5DB] disabled:cursor-not-allowed disabled:opacity-40">
                  Retry
                </button>
                <button onClick={() => void runAgent()} disabled={running || !agentPrompt.trim()} className="grid size-8 place-items-center rounded-lg bg-[#7C5CFF] text-white disabled:cursor-not-allowed disabled:opacity-40" title="Send prompt">
                  {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
