import "server-only";

import crypto from "crypto";
import { execFile } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { WorkspaceProject } from "@prisma/client";

const execFileAsync = promisify(execFile);

type IdeSession = {
  workspaceId: string;
  userId: string;
  token: string;
  port: number;
  workspacePath: string;
  containerName: string;
  expiresAt: string;
  createdAt: string;
};

type Registry = Record<string, IdeSession>;

export const IDE_PROXY_PORT = Number(process.env.MELDEX_IDE_PROXY_PORT || 3101);
const SESSION_TTL_MS = 1000 * 60 * 60 * 2;
const SESSION_FILE = process.env.MELDEX_IDE_SESSION_FILE || path.join(os.tmpdir(), "meldex-openvscode-sessions.json");
const IDE_PORT_BASE = Number(process.env.MELDEX_IDE_PORT_BASE || 41000);
const IDE_PORT_SPAN = Number(process.env.MELDEX_IDE_PORT_SPAN || 12000);

function workspacePort(workspaceId: string) {
  const digest = crypto.createHash("sha256").update(workspaceId).digest();
  return IDE_PORT_BASE + (digest.readUInt32BE(0) % IDE_PORT_SPAN);
}

function containerName(workspaceId: string) {
  return `meldex-ide-${workspaceId.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 48)}`;
}

async function readRegistry(): Promise<Registry> {
  try {
    return JSON.parse(await readFile(SESSION_FILE, "utf8")) as Registry;
  } catch {
    return {};
  }
}

async function writeRegistry(registry: Registry) {
  await mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, JSON.stringify(registry, null, 2), { mode: 0o600 });
}

async function docker(args: string[]) {
  return execFileAsync("docker", args, { timeout: 60_000, maxBuffer: 1024 * 1024 * 4 });
}

async function containerIsRunning(name: string) {
  try {
    const { stdout } = await docker(["inspect", "-f", "{{.State.Running}}", name]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function ensureOpenVSCodeContainer(session: IdeSession) {
  if (await containerIsRunning(session.containerName)) return;
  await docker(["rm", "-f", session.containerName]).catch(() => undefined);
  await mkdir(session.workspacePath, { recursive: true });
  await docker([
    "run",
    "-d",
    "--name", session.containerName,
    "--init",
    "--restart", "unless-stopped",
    "-p", `127.0.0.1:${session.port}:3000`,
    "-v", `${session.workspacePath}:/home/workspace:cached`,
    "gitpod/openvscode-server:latest",
  ]);
}

export async function ensureOpenVSCodeSession(input: { userId: string; project: WorkspaceProject }) {
  const now = Date.now();
  const registry = await readRegistry();
  const existing = registry[input.project.id];
  if (existing && existing.userId === input.userId && new Date(existing.expiresAt).getTime() > now + 60_000) {
    await ensureOpenVSCodeContainer(existing);
    return { ...existing, url: `/ide/${encodeURIComponent(existing.workspaceId)}/?tkn=${encodeURIComponent(existing.token)}` };
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const session: IdeSession = {
    workspaceId: input.project.id,
    userId: input.userId,
    token,
    port: workspacePort(input.project.id),
    workspacePath: input.project.storagePath,
    containerName: containerName(input.project.id),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    createdAt: new Date(now).toISOString(),
  };

  await ensureOpenVSCodeContainer(session);
  registry[input.project.id] = session;
  await writeRegistry(registry);
  return { ...session, url: `/ide/${encodeURIComponent(session.workspaceId)}/?tkn=${encodeURIComponent(session.token)}` };
}
