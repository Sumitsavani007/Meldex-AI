import * as fs from "fs";
import * as path from "path";
import { WorkspaceCtx } from "../api/client";
import { ParsedError } from "./errorParser";

export interface FixRequestInput {
  root: string;
  taskGoal: string;
  error: ParsedError;
  rawOutput: string;
  recentFiles: string[];
}

export function buildFixTask(input: FixRequestInput): { task: string; context: WorkspaceCtx } {
  const packageJson = readFileSafe(path.join(input.root, "package.json"), 5000);
  const primaryFile = input.error.file ? normalizeWorkspacePath(input.root, input.error.file) : undefined;
  const relevant = [
    primaryFile,
    ...input.recentFiles,
    "package.json",
  ].filter((file): file is string => !!file && isSafeRel(file));
  const uniqueRelevant = [...new Set(relevant)].slice(0, 8);
  const fileBlocks = uniqueRelevant
    .map((rel) => {
      const content = readFileSafe(path.join(input.root, rel), 7000);
      return content ? `### ${rel}\n\`\`\`\n${content}\n\`\`\`` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const location = [
    input.error.file ? `File: ${input.error.file}` : "",
    input.error.line ? `Line: ${input.error.line}` : "",
    input.error.column ? `Column: ${input.error.column}` : "",
  ].filter(Boolean).join("\n");

  return {
    task: `Autofix the failed run/build with a minimal patch.

Original task:
${input.taskGoal}

Parsed error:
Title: ${input.error.title}
Kind: ${input.error.kind}
${location}
Message: ${input.error.message}
Probable cause: ${input.error.probableCause}
Fix strategy: ${input.error.fixStrategy}

Raw output excerpt:
\`\`\`
${input.rawOutput.slice(-6000)}
\`\`\`

Relevant files:
${fileBlocks || "(No relevant file content available)"}

Return structured patch actions only. Keep the change minimal, preserve the existing style, and do not introduce new dependencies unless absolutely necessary.`,
    context: {
      projectType: "Autofix",
      terminalError: input.rawOutput.slice(-6000),
      packageJson,
      projectFiles: uniqueRelevant,
      activeFile: primaryFile,
      activeFileContent: primaryFile ? readFileSafe(path.join(input.root, primaryFile), 7000) : undefined,
    },
  };
}

function normalizeWorkspacePath(root: string, file: string): string | undefined {
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, absolute);
  return isSafeRel(rel) ? rel : undefined;
}

function isSafeRel(rel: string): boolean {
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel) && !/(^|[\\/])\.env(\.|$)/.test(rel);
}

function readFileSafe(filePath: string, limit: number): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 500_000) return undefined;
    return fs.readFileSync(filePath, "utf8").slice(0, limit);
  } catch {
    return undefined;
  }
}
