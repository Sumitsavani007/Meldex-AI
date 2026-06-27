import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOwnedWorkspaceProject } from "@/lib/ai-workspace";
import { IdeFrameClient } from "./ide-frame-client";

export const dynamic = "force-dynamic";

export default async function WorkspaceIdePage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/workspace`);
  const { projectId } = await params;
  const project = await getOwnedWorkspaceProject(session.user.id, projectId);
  return <IdeFrameClient projectId={project.id} projectName={project.name} projectCreatedAt={project.createdAt.toISOString()} />;
}
