import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOwnedWorkspaceProject } from "@/lib/ai-workspace";
import { ensureOpenVSCodeSession } from "@/lib/openvscode-manager";

export const dynamic = "force-dynamic";

export default async function WorkspaceIdePage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/workspace`);
  const { projectId } = await params;
  const project = await getOwnedWorkspaceProject(session.user.id, projectId);
  const ideSession = await ensureOpenVSCodeSession({ userId: session.user.id, project });
  const ideUrl = ideSession.url;

  return (
    <main className="flex h-screen min-h-0 bg-[#0B0D12] text-white">
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#22252D] bg-[#111318] px-4">
          <Link href={`/workspace/${project.id}`} className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-white">
            <ArrowLeft className="size-4" />
            {project.name}
          </Link>
          <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
            <span>IDE session expires {new Date(ideSession.expiresAt).toLocaleTimeString()}</span>
            <a href={ideUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] px-3 py-1.5 text-sm font-medium text-white">
              Open full tab
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
        <iframe
          title={`${project.name} IDE`}
          src={ideUrl}
          className="min-h-0 flex-1 border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"
        />
      </section>
    </main>
  );
}
