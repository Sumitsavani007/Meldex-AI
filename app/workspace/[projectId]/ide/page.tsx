import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldAlert, TerminalSquare } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOwnedWorkspaceProject } from "@/lib/ai-workspace";

export const dynamic = "force-dynamic";

function ideUrlFor(projectId: string) {
  const template = process.env.MELDEX_OPENVSCODE_URL_TEMPLATE || "";
  const base = process.env.MELDEX_OPENVSCODE_BASE_URL || "";
  if (template) return template.replaceAll("{workspaceId}", encodeURIComponent(projectId));
  if (base) return `${base.replace(/\/$/, "")}/?workspace=${encodeURIComponent(projectId)}`;
  return "";
}

export default async function WorkspaceIdePage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/workspace`);
  const { projectId } = await params;
  const project = await getOwnedWorkspaceProject(session.user.id, projectId);
  const ideUrl = ideUrlFor(project.id);

  return (
    <main className="flex h-screen min-h-0 bg-[#0B0D12] text-white">
      {!ideUrl ? (
        <section className="m-auto w-full max-w-3xl rounded-2xl border border-[#22252D] bg-[#111318] p-8 shadow-2xl">
          <Link href={`/workspace/${project.id}`} className="mb-8 inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-white">
            <ArrowLeft className="size-4" />
            Back to Meldex Workspace
          </Link>
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#7C5CFF]/15 text-[#A996FF]">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A996FF]">OpenVSCode Server not configured</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Secure IDE service required</h1>
              <p className="mt-3 text-sm leading-6 text-[#9CA3AF]">
                Meldex verified that you own this workspace, but the OpenVSCode Server runtime is not running/configured for production yet.
                Configure a per-workspace OpenVSCode service and set <code className="rounded bg-white/10 px-1.5 py-0.5">MELDEX_OPENVSCODE_URL_TEMPLATE</code>.
              </p>
              <div className="mt-6 rounded-xl border border-[#22252D] bg-[#0B0D12] p-4 font-mono text-xs leading-6 text-[#D1D5DB]">
                <div className="mb-2 flex items-center gap-2 text-[#A996FF]"><TerminalSquare className="size-4" /> AWS service shape</div>
                <pre className="whitespace-pre-wrap">{`docker run --init \\
  -p 127.0.0.1:<port>:3000 \\
  -v "${project.storagePath}:/home/workspace:cached" \\
  gitpod/openvscode-server:latest \\
  --host 0.0.0.0 --connection-token <per-session-token>`}</pre>
              </div>
              <p className="mt-4 text-xs text-[#6B7280]">
                Workspace path is shown only after auth/ownership verification. Do not expose this route publicly without the tokenized OpenVSCode proxy.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#22252D] bg-[#111318] px-4">
            <Link href={`/workspace/${project.id}`} className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-white">
              <ArrowLeft className="size-4" />
              {project.name}
            </Link>
            <a href={ideUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] px-3 py-1.5 text-sm font-medium text-white">
              Open full tab
              <ExternalLink className="size-4" />
            </a>
          </div>
          <iframe
            title={`${project.name} IDE`}
            src={ideUrl}
            className="min-h-0 flex-1 border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
          />
        </section>
      )}
    </main>
  );
}
