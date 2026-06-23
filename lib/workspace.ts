import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";

export type WorkspaceNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceNode[];
};

const root = path.join(process.cwd(), "workspace");

function safePath(relativePath = "") {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.join(root, normalized);

  if (!absolute.startsWith(root)) {
    throw new Error("Path escapes workspace");
  }

  return { absolute, relative: normalized === "." ? "" : normalized };
}

export async function ensureWorkspace() {
  await mkdir(root, { recursive: true });
}

export async function listWorkspace(relativePath = ""): Promise<WorkspaceNode[]> {
  await ensureWorkspace();
  const { absolute } = safePath(relativePath);
  const entries = await readdir(absolute, { withFileTypes: true });

  const nodes = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".DS_Store"))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map(async (entry) => {
        const childPath = path.join(relativePath, entry.name);
        const normalizedChild = childPath.split(path.sep).join("/");
        const node: WorkspaceNode = {
          name: entry.name,
          path: normalizedChild,
          type: entry.isDirectory() ? "folder" : "file"
        };

        if (entry.isDirectory()) {
          node.children = await listWorkspace(normalizedChild);
        }

        return node;
      })
  );

  return nodes;
}

export async function readWorkspaceFile(relativePath: string) {
  const { absolute } = safePath(relativePath);
  const fileStat = await stat(absolute);

  if (!fileStat.isFile()) {
    throw new Error("Requested path is not a file");
  }

  return readFile(absolute, "utf8");
}

export async function writeWorkspaceFile(relativePath: string, content: string) {
  const { absolute } = safePath(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

export async function createWorkspaceFolder(relativePath: string) {
  const { absolute } = safePath(relativePath);
  await mkdir(absolute, { recursive: true });
}

export async function deleteWorkspacePath(relativePath: string) {
  const { absolute } = safePath(relativePath);
  if (absolute === root) {
    throw new Error("Cannot delete workspace root");
  }
  await rm(absolute, { recursive: true, force: true });
}
