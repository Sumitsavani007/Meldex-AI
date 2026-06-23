import { spawn } from "child_process";
import { getWorkspaceRoot } from "@/lib/workspace";
import { applyTerminalFixLoop, isAllowedCommand, isDangerousCommand } from "@/lib/agent";

export type TerminalExecutionResult = {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  attempts: number;
  fixed: boolean;
  changedFiles?: string[];
};

function runProcess(command: string, timeoutMs: number) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, {
      cwd: getWorkspaceRoot(),
      shell: true,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref?.();
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function executeTerminalCommand(command: string, options?: { autoFix?: boolean; timeoutMs?: number }) {
  const normalized = command.trim().replace(/\s+/g, " ");

  if (isDangerousCommand(normalized)) {
    throw new Error("Dangerous commands are blocked.");
  }

  if (!isAllowedCommand(normalized)) {
    throw new Error(`Command is not allowlisted: ${normalized}`);
  }

  const timeoutMs = options?.timeoutMs ?? (normalized === "npm run dev" ? 15000 : 120000);
  const initial = await runProcess(normalized, timeoutMs);

  if (!options?.autoFix || initial.code === 0) {
    return {
      command: normalized,
      ...initial,
      attempts: 1,
      fixed: initial.code === 0
    } satisfies TerminalExecutionResult;
  }

  const fixed = await applyTerminalFixLoop(normalized, initial, async (nextCommand) => runProcess(nextCommand, timeoutMs));
  return {
    command: normalized,
    ...fixed
  } satisfies TerminalExecutionResult;
}
