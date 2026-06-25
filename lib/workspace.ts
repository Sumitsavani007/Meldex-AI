import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import {
  isR2Configured,
  uploadToR2,
  downloadFromR2,
  deleteFromR2,
  listR2Prefix,
  buildKey,
} from "@/lib/r2";

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
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (absolute !== root && !absolute.startsWith(rootPrefix)) {
    throw new Error("Path escapes workspace");
  }

  return { absolute, relative: normalized === "." ? "" : normalized };
}

export function getWorkspaceRoot() {
  return root;
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

// ── R2-backed file upload / download ─────────────────────────────────────────
// Used by project file manager when R2 is configured.

/**
 * Upload a file to R2 under the workspace/ folder.
 * Falls back to local filesystem if R2 is not configured.
 */
export async function uploadProjectFile(
  projectId: string,
  relativePath: string,
  content: Buffer | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; publicUrl: string | null } | { localPath: string }> {
  if (isR2Configured()) {
    const key = buildKey("workspace", projectId, relativePath);
    const body = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    return uploadToR2({ key, body, contentType });
  }

  // Fallback: local filesystem
  const rel = `${projectId}/${relativePath}`;
  const body = typeof content === "string" ? content : content.toString("utf8");
  await writeWorkspaceFile(rel, body);
  return { localPath: rel };
}

/**
 * Download a project file from R2.
 * Falls back to local filesystem if R2 is not configured.
 */
export async function downloadProjectFile(
  projectId: string,
  relativePath: string
): Promise<string> {
  if (isR2Configured()) {
    const key = buildKey("workspace", projectId, relativePath);
    const buf = await downloadFromR2(key);
    return buf.toString("utf8");
  }

  return readWorkspaceFile(`${projectId}/${relativePath}`);
}

/**
 * Delete a project file from R2 (or local FS fallback).
 */
export async function deleteProjectFile(
  projectId: string,
  relativePath: string
): Promise<void> {
  if (isR2Configured()) {
    const key = buildKey("workspace", projectId, relativePath);
    await deleteFromR2(key);
    return;
  }

  await deleteWorkspacePath(`${projectId}/${relativePath}`);
}

/**
 * List project files from R2 (or local FS fallback).
 */
export async function listProjectFiles(
  projectId: string
): Promise<{ path: string; size: number }[]> {
  if (isR2Configured()) {
    const prefix = buildKey("workspace", projectId, "");
    const objects = await listR2Prefix(prefix);
    return objects.map((o) => ({
      path: o.key.replace(`${prefix}`, ""),
      size: o.size,
    }));
  }

  // Local fallback: flatten the workspace tree
  const nodes = await listWorkspace(projectId).catch(() => []);
  function flatten(items: WorkspaceNode[]): { path: string; size: number }[] {
    return items.flatMap((n) =>
      n.type === "file"
        ? [{ path: n.path, size: 0 }]
        : flatten(n.children ?? [])
    );
  }
  return flatten(nodes);
}
