import { WorkspaceClient } from "../../workspace-client";

export const dynamic = "force-dynamic";

export default async function WorkspaceIdePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <WorkspaceClient projectId={projectId} />;
}
