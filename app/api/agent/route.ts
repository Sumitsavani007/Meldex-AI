import { NextResponse } from "next/server";
import { listWorkspace, writeWorkspaceFile } from "@/lib/workspace";

function flattenTree(nodes: Awaited<ReturnType<typeof listWorkspace>>, output: string[] = []) {
  for (const node of nodes) {
    output.push(`${node.type === "folder" ? "dir " : "file"} ${node.path}`);
    if (node.children) {
      flattenTree(node.children, output);
    }
  }
  return output;
}

export async function POST(request: Request) {
  try {
    const { task } = (await request.json()) as { task?: string };

    if (!task?.trim()) {
      return NextResponse.json({ error: "Task is required." }, { status: 400 });
    }

    const tree = await listWorkspace();
    const files = flattenTree(tree);
    const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "agent-task";
    const planPath = `agent-runs/${Date.now()}-${slug}.md`;
    const plan = [
      `# Meldex AI Agent Plan`,
      ``,
      `Task: ${task.trim()}`,
      ``,
      `## Files Read`,
      files.length ? files.map((file) => `- ${file}`).join("\n") : "- Workspace is empty.",
      ``,
      `## Plan`,
      `1. Inspect the current workspace structure.`,
      `2. Identify files that should be created or edited.`,
      `3. Apply non-destructive changes first.`,
      `4. Ask for confirmation before delete or overwrite-heavy actions.`,
      `5. Report changed files and final summary.`,
      ``,
      `## Summary`,
      `Created this agent plan file as the first concrete artifact for the requested task.`
    ].join("\n");

    await writeWorkspaceFile(planPath, plan);

    return NextResponse.json({
      plan,
      changedFiles: [planPath],
      summary: "Agent plan generated and saved in the local workspace.",
      tree: await listWorkspace()
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent task failed" }, { status: 400 });
  }
}
