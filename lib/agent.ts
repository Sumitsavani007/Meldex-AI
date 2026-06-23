import { stat } from "fs/promises";
import path from "path";
import { ensureWorkspace, getWorkspaceRoot, listWorkspace, readWorkspaceFile, writeWorkspaceFile } from "@/lib/workspace";

export type AgentAction =
  | { type: "read_file"; path: string }
  | { type: "create_file"; path: string; content: string }
  | { type: "update_file"; path: string; content: string }
  | { type: "summary"; text: string };

export type AgentFileSnapshot = {
  path: string;
  content: string;
};

export type TerminalRun = {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  attempts: number;
  fixed: boolean;
  changedFiles?: string[];
};

export type AgentRunResult = {
  summary: string;
  changedFiles: string[];
  tree: Awaited<ReturnType<typeof listWorkspace>>;
  logs: string[];
  terminalRuns: TerminalRun[];
};

const OLLAMA_DEFAULT_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen3-coder:30b";
const MAX_READS_PER_ROUND = 6;
const MAX_ACTION_ROUNDS = 5;
const MAX_TERMINAL_FIX_ATTEMPTS = 5;
const MAX_CONTEXT_CHARS = 12000;
const MAX_FILE_CHARS = 16000;

const DANGEROUS_COMMAND_RE = /\b(?:rm\s+-rf|sudo|shutdown|reboot|mkfs|dd)\b/i;

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

export function isDangerousCommand(command: string) {
  return DANGEROUS_COMMAND_RE.test(command);
}

export function isAllowedCommand(command: string) {
  const normalized = normalizeCommand(command);
  return ["npm install", "npm run dev", "npm run build", "npm test"].includes(normalized);
}

export function readJsonEnvelope(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    throw new Error(`Agent returned non-JSON content: ${content.slice(0, 500)}`);
  }

  return JSON.parse(candidate.slice(first, last + 1)) as {
    summary?: string;
    actions?: AgentAction[];
  };
}

function flattenWorkspaceTree(nodes: Awaited<ReturnType<typeof listWorkspace>>, output: { path: string; type: "file" | "folder" }[] = []) {
  for (const node of nodes) {
    output.push({ path: node.path, type: node.type });
    if (node.children) {
      flattenWorkspaceTree(node.children, output);
    }
  }

  return output;
}

function tokenizeTask(task: string) {
  return task
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function scorePath(pathname: string, taskTokens: string[]) {
  const lower = pathname.toLowerCase();
  let score = 0;

  for (const token of taskTokens) {
    if (lower.includes(token)) {
      score += 10;
    }
    if (path.basename(lower) === token) {
      score += 15;
    }
  }

  if (/package\.json$/.test(lower) || /next\.config\./.test(lower) || /tsconfig\.json$/.test(lower)) {
    score += 8;
  }

  if (/(app|page|route|component|layout|api|lib)/.test(lower)) {
    score += 3;
  }

  return score;
}

export async function selectRelevantFiles(task: string, tree: Awaited<ReturnType<typeof listWorkspace>>) {
  const files = flattenWorkspaceTree(tree).filter((node) => node.type === "file");
  const taskTokens = tokenizeTask(task);

  return files
    .map((file) => ({ ...file, score: scorePath(file.path, taskTokens) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 8)
    .map((file) => file.path);
}

async function safeReadWorkspaceFile(filePath: string) {
  const content = await readWorkspaceFile(filePath);
  return content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n\n[truncated]` : content;
}

function resolveWorkspaceFile(relativePath: string) {
  const root = getWorkspaceRoot();
  const absolute = path.resolve(root, relativePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (absolute !== root && !absolute.startsWith(rootPrefix)) {
    throw new Error("Path escapes workspace");
  }

  return absolute;
}

async function fileExists(relativePath: string) {
  try {
    await stat(resolveWorkspaceFile(relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function gatherWorkspaceSnapshot(task: string) {
  await ensureWorkspace();
  const tree = await listWorkspace();
  const relevantFiles = await selectRelevantFiles(task, tree);
  const snapshots: AgentFileSnapshot[] = [];

  for (const filePath of relevantFiles) {
    try {
      snapshots.push({ path: filePath, content: await safeReadWorkspaceFile(filePath) });
    } catch {
      snapshots.push({ path: filePath, content: "[unreadable]" });
    }
  }

  return { tree, relevantFiles, snapshots };
}

export async function applyAgentAction(action: AgentAction, changedFiles: Set<string>) {
  if (action.type === "read_file") {
    const content = await safeReadWorkspaceFile(action.path);
    return { type: "read_file" as const, path: action.path, content };
  }

  if (action.type === "create_file") {
    if (await fileExists(action.path)) {
      throw new Error(`File already exists: ${action.path}`);
    }

    await writeWorkspaceFile(action.path, action.content);
    changedFiles.add(action.path);
    return { type: "create_file" as const, path: action.path };
  }

  if (action.type === "update_file") {
    try {
      const fileStat = await stat(resolveWorkspaceFile(action.path));
      if (!fileStat.isFile()) {
        throw new Error(`Not a file: ${action.path}`);
      }
    } catch {
      throw new Error(`File does not exist for update: ${action.path}`);
    }

    await writeWorkspaceFile(action.path, action.content);
    changedFiles.add(action.path);
    return { type: "update_file" as const, path: action.path };
  }

  return { type: "summary" as const, text: action.text };
}

function renderWorkspaceTree(tree: Awaited<ReturnType<typeof listWorkspace>>) {
  const lines: string[] = [];

  const walk = (nodes: Awaited<ReturnType<typeof listWorkspace>>, depth = 0) => {
    for (const node of nodes) {
      lines.push(`${"  ".repeat(depth)}- ${node.type === "folder" ? "dir" : "file"} ${node.path || node.name}`);
      if (node.children) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(tree);
  return lines.length ? lines.join("\n") : "- Workspace is empty.";
}

function renderContext(readFiles: Record<string, string>, terminalRuns: TerminalRun[]) {
  const readEntries = Object.entries(readFiles)
    .map(([filePath, content]) => `### ${filePath}\n${content}`)
    .join("\n\n");

  const terminalEntries = terminalRuns
    .map((run) => `### ${run.command}\nexit code: ${run.code}\nstdout:\n${run.stdout || "[empty]"}\nstderr:\n${run.stderr || "[empty]"}`)
    .join("\n\n");

  return [readEntries ? `## Read Files\n${readEntries}` : "", terminalEntries ? `## Terminal Runs\n${terminalEntries}` : ""].filter(Boolean).join("\n\n");
}

function buildPrompt(task: string, tree: Awaited<ReturnType<typeof listWorkspace>>, snapshots: AgentFileSnapshot[], readFiles: Record<string, string>, terminalRuns: TerminalRun[]) {
  const treeText = renderWorkspaceTree(tree).slice(0, MAX_CONTEXT_CHARS);
  const snapshotText = snapshots
    .map((snapshot) => `### ${snapshot.path}\n${snapshot.content}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

  return [
    `You are Meldex AI, an autonomous coding agent editing only the local workspace.`,
    `Return valid JSON only.`,
    `Schema: { "summary": string, "actions": [{ "type": "read_file" | "create_file" | "update_file" | "summary", "path"?: string, "content"?: string, "text"?: string }] }`,
    `Use read_file when you need more context. Use create_file for brand new files. Use update_file for existing files. Never use delete actions.`,
    `If a file already exists, do not create it again. If a file does not exist, do not update it.`,
    `Only modify files inside the workspace.`,
    `Task:\n${task.trim()}`,
    `Workspace tree:\n${treeText}`,
    snapshots.length ? `Relevant files:\n${snapshotText}` : `Relevant files:\n- none`,
    renderContext(readFiles, terminalRuns)
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildFixPrompt(command: string, result: { stdout: string; stderr: string }, tree: Awaited<ReturnType<typeof listWorkspace>>, snapshots: AgentFileSnapshot[], readFiles: Record<string, string>) {
  const treeText = renderWorkspaceTree(tree).slice(0, MAX_CONTEXT_CHARS);
  const snapshotText = snapshots
    .map((snapshot) => `### ${snapshot.path}\n${snapshot.content}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

  return [
    `You are fixing a failing terminal command in the local workspace.`,
    `Return valid JSON only.`,
    `Schema: { "summary": string, "actions": [{ "type": "read_file" | "create_file" | "update_file" | "summary", "path"?: string, "content"?: string, "text"?: string }] }`,
    `Command:\n${command}`,
    `Stdout:\n${result.stdout || "[empty]"}`,
    `Stderr:\n${result.stderr || "[empty]"}`,
    `Workspace tree:\n${treeText}`,
    snapshots.length ? `Relevant files:\n${snapshotText}` : `Relevant files:\n- none`,
    renderContext(readFiles, [])
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function callOllama(prompt: string, baseUrl = OLLAMA_DEFAULT_URL, model = DEFAULT_MODEL) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You output strict JSON and never wrap the response in markdown."
        },
        { role: "user", content: prompt }
      ]
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama returned ${response.status}. ${detail || "Check the model name and local server."}`);
  }

  const data = (await response.json()) as { message?: { content?: string }; response?: string };
  const content = data.message?.content ?? data.response ?? "";

  if (!content.trim()) {
    throw new Error("Ollama returned an empty response.");
  }

  return content;
}

export async function runAgent(task: string, options?: { baseUrl?: string; model?: string; runCommand?: (command: string, opts?: { autoFix?: boolean }) => Promise<TerminalRun> }) {
  const { tree, relevantFiles, snapshots } = await gatherWorkspaceSnapshot(task);
  const changedFiles = new Set<string>();
  const readFiles: Record<string, string> = {};
  const terminalRuns: TerminalRun[] = [];
  const logs: string[] = [`[agent] ${task.trim()}`];
  let summary = "";

  if (relevantFiles.length) {
    logs.push(`[files] ${relevantFiles.join(", ")}`);
  }

  for (let round = 0; round < MAX_ACTION_ROUNDS; round += 1) {
    const content = await callOllama(buildPrompt(task, tree, snapshots, readFiles, terminalRuns), options?.baseUrl, options?.model);
    const envelope = readJsonEnvelope(content);
    const actions = Array.isArray(envelope.actions) ? envelope.actions : [];

    if (typeof envelope.summary === "string" && envelope.summary.trim()) {
      summary = envelope.summary.trim();
    }

    if (!actions.length) {
      break;
    }

    const readRequests = actions.filter((action): action is Extract<AgentAction, { type: "read_file" }> => action.type === "read_file").slice(0, MAX_READS_PER_ROUND);

    if (readRequests.length) {
      for (const action of readRequests) {
        try {
          readFiles[action.path] = await safeReadWorkspaceFile(action.path);
        } catch (error) {
          readFiles[action.path] = error instanceof Error ? error.message : "Unable to read file";
        }
      }

      logs.push(`[read] ${readRequests.map((action) => action.path).join(", ")}`);
      continue;
    }

    for (const action of actions) {
      if (action.type === "summary") {
        summary = action.text.trim() || summary;
        continue;
      }

      const result = await applyAgentAction(action, changedFiles);
      if (result.type === "create_file" || result.type === "update_file") {
        logs.push(`[changed] ${result.path}`);
      }
    }

    break;
  }

  const runCommand = options?.runCommand;
  if (runCommand && changedFiles.size > 0) {
    const buildResult = await runCommand("npm run build", { autoFix: true });
    terminalRuns.push(buildResult);
    for (const filePath of buildResult.changedFiles ?? []) {
      changedFiles.add(filePath);
    }
    logs.push(`[terminal] npm run build -> exit ${buildResult.code}`);
    if (buildResult.stderr.trim()) {
      logs.push(`[stderr] ${buildResult.stderr.trim().slice(0, 500)}`);
    }
    if (buildResult.stdout.trim()) {
      logs.push(`[stdout] ${buildResult.stdout.trim().slice(0, 500)}`);
    }
    if (!buildResult.fixed && buildResult.code !== 0) {
      summary = summary || "Applied file changes, but npm run build still reports errors after the fix loop.";
    } else {
      summary = summary || "Applied file changes and verified the workspace with npm run build.";
    }
  }

  if (!summary) {
    summary = changedFiles.size ? "Applied the requested workspace changes." : "Reviewed the workspace and returned no file edits.";
  }

  return {
    summary,
    changedFiles: [...changedFiles],
    tree: await listWorkspace(),
    logs,
    terminalRuns
  } satisfies AgentRunResult;
}

export async function applyTerminalFixLoop(
  command: string,
  initialResult: { code: number; stdout: string; stderr: string },
  runCommand: (command: string) => Promise<{ code: number; stdout: string; stderr: string }>,
  changedFiles = new Set<string>()
) {
  let attempts = 0;
  let lastResult = initialResult;

  while (lastResult.code !== 0 && attempts < MAX_TERMINAL_FIX_ATTEMPTS) {
    attempts += 1;
    const { tree, snapshots } = await gatherWorkspaceSnapshot(`${command}\n${lastResult.stdout}\n${lastResult.stderr}`);
    const readFiles: Record<string, string> = {};

    for (let round = 0; round < 2; round += 1) {
      const content = await callOllama(buildFixPrompt(command, lastResult, tree, snapshots, readFiles));
      const envelope = readJsonEnvelope(content);
      const actions = Array.isArray(envelope.actions) ? envelope.actions : [];

      const readRequests = actions.filter((action): action is Extract<AgentAction, { type: "read_file" }> => action.type === "read_file");
      if (readRequests.length) {
        for (const action of readRequests) {
          try {
            readFiles[action.path] = await safeReadWorkspaceFile(action.path);
          } catch (error) {
            readFiles[action.path] = error instanceof Error ? error.message : "Unable to read file";
          }
        }
        continue;
      }

      for (const action of actions) {
        if (action.type === "summary") {
          continue;
        }

        await applyAgentAction(action, changedFiles);
      }
      break;
    }

    lastResult = await runCommand(command);
  }

  return {
    ...lastResult,
    attempts: attempts + 1,
    fixed: lastResult.code === 0,
    changedFiles: [...changedFiles]
  };
}

export async function readFileIfExists(relativePath: string) {
  try {
    return await safeReadWorkspaceFile(relativePath);
  } catch {
    return null;
  }
}
