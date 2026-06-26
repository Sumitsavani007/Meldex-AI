import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export type PatchOperation = "create" | "edit" | "update" | "delete";

export type AgentFileChange = {
  operation: PatchOperation;
  path: string;
  content?: string;
  description?: string;
};

export type DiffLine = {
  type: "context" | "add" | "remove";
  oldLine?: number;
  newLine?: number;
  text: string;
};

export type FilePatch = {
  id: string;
  operation: "create" | "edit" | "delete";
  path: string;
  description?: string;
  oldContent: string;
  newContent: string;
  added: number;
  removed: number;
  diff: DiffLine[];
  status: "pending" | "applied" | "rejected";
};

export type PatchSummary = {
  files: FilePatch[];
  totalAdded: number;
  totalRemoved: number;
};

export class PatchEngine {
  private patches = new Map<string, FilePatch>();
  private undoStack: { path: string; content: string | null }[][] = [];

  constructor(private readonly workspaceRoot: string, private readonly storageRoot?: string) {}

  async calculateDiff(oldContent: string, newContent: string): Promise<DiffLine[]> {
    const oldLines = oldContent.length ? oldContent.split(/\r?\n/) : [];
    const newLines = newContent.length ? newContent.split(/\r?\n/) : [];

    if (oldLines.length * newLines.length > 250_000) {
      return [
        ...oldLines.map((text, index) => ({ type: "remove" as const, oldLine: index + 1, text })),
        ...newLines.map((text, index) => ({ type: "add" as const, newLine: index + 1, text })),
      ];
    }

    const dp: number[][] = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
    for (let i = oldLines.length - 1; i >= 0; i -= 1) {
      for (let j = newLines.length - 1; j >= 0; j -= 1) {
        dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const diff: DiffLine[] = [];
    let i = 0;
    let j = 0;
    let oldLine = 1;
    let newLine = 1;
    while (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        diff.push({ type: "context", oldLine, newLine, text: oldLines[i] });
        i += 1; j += 1; oldLine += 1; newLine += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        diff.push({ type: "remove", oldLine, text: oldLines[i] });
        i += 1; oldLine += 1;
      } else {
        diff.push({ type: "add", newLine, text: newLines[j] });
        j += 1; newLine += 1;
      }
    }
    while (i < oldLines.length) {
      diff.push({ type: "remove", oldLine, text: oldLines[i] });
      i += 1; oldLine += 1;
    }
    while (j < newLines.length) {
      diff.push({ type: "add", newLine, text: newLines[j] });
      j += 1; newLine += 1;
    }
    return diff;
  }

  countAddedRemovedLines(diff: DiffLine[]) {
    return {
      added: diff.filter((line) => line.type === "add").length,
      removed: diff.filter((line) => line.type === "remove").length,
    };
  }

  async createPatches(files: AgentFileChange[]): Promise<PatchSummary> {
    const patches: FilePatch[] = [];
    for (const file of files) {
      if (this.isEnvFile(file.path)) continue;
      const fullPath = this.resolveSafePath(file.path);
      const operation = file.operation === "update" ? "edit" : file.operation;
      const oldContent = fs.existsSync(fullPath) && operation !== "create" ? fs.readFileSync(fullPath, "utf8") : "";
      const newContent = operation === "delete" ? "" : file.content ?? "";
      const diff = await this.calculateDiff(oldContent, newContent);
      const counts = this.countAddedRemovedLines(diff);
      const patch: FilePatch = {
        id: Buffer.from(`${operation}:${file.path}`).toString("base64url"),
        operation,
        path: file.path,
        description: file.description,
        oldContent,
        newContent,
        added: counts.added,
        removed: counts.removed,
        diff,
        status: "pending",
      };
      this.patches.set(patch.id, patch);
      patches.push(patch);
    }
    return {
      files: patches,
      totalAdded: patches.reduce((sum, patch) => sum + patch.added, 0),
      totalRemoved: patches.reduce((sum, patch) => sum + patch.removed, 0),
    };
  }

  async previewPatch(patchId?: string): Promise<void> {
    const patches = patchId ? [this.requiredPatch(patchId)] : [...this.patches.values()];
    for (const patch of patches) {
      const left = await this.writeTemp(`${patch.id}.current`, patch.oldContent);
      const right = await this.writeTemp(`${patch.id}.proposed`, patch.newContent);
      await vscode.commands.executeCommand(
        "vscode.diff",
        left,
        right,
        `${patch.path}  +${patch.added} -${patch.removed}`
      );
    }
  }

  async applyPatch(patchIds?: string[]): Promise<{ applied: string[]; errors: string[] }> {
    const selected = patchIds?.length ? patchIds.map((id) => this.requiredPatch(id)) : [...this.patches.values()];
    const applied: string[] = [];
    const errors: string[] = [];
    const undoBatch: { path: string; content: string | null }[] = [];

    for (const patch of selected) {
      try {
        const fullPath = this.resolveSafePath(patch.path);
        undoBatch.push({ path: patch.path, content: fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : null });
        if (patch.operation === "delete") {
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } else {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, patch.newContent, "utf8");
        }
        patch.status = "applied";
        applied.push(patch.path);
      } catch (error) {
        errors.push(`${patch.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (undoBatch.length) this.undoStack.push(undoBatch);
    return { applied, errors };
  }

  rejectPatch(patchIds?: string[]): string[] {
    const selected = patchIds?.length ? patchIds.map((id) => this.requiredPatch(id)) : [...this.patches.values()];
    for (const patch of selected) patch.status = "rejected";
    return selected.map((patch) => patch.path);
  }

  async undoLastPatch(): Promise<{ restored: string[]; errors: string[] }> {
    const batch = this.undoStack.pop() ?? [];
    const restored: string[] = [];
    const errors: string[] = [];
    for (const item of batch.reverse()) {
      try {
        const fullPath = this.resolveSafePath(item.path);
        if (item.content === null) {
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } else {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, item.content, "utf8");
        }
        restored.push(item.path);
      } catch (error) {
        errors.push(`${item.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { restored, errors };
  }

  getSummary(): PatchSummary {
    const files = [...this.patches.values()];
    return {
      files,
      totalAdded: files.reduce((sum, patch) => sum + patch.added, 0),
      totalRemoved: files.reduce((sum, patch) => sum + patch.removed, 0),
    };
  }

  private requiredPatch(id: string): FilePatch {
    const patch = this.patches.get(id);
    if (!patch) throw new Error(`Unknown patch: ${id}`);
    return patch;
  }

  private resolveSafePath(filePath: string): string {
    if (this.isEnvFile(filePath)) throw new Error(`Blocked env file: ${filePath}`);
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    const root = path.resolve(this.workspaceRoot);
    if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Path escapes workspace: ${filePath}`);
    }
    return fullPath;
  }

  private isEnvFile(filePath: string): boolean {
    return /^\.env(\.|$)/.test(path.basename(filePath));
  }

  private async writeTemp(name: string, content: string): Promise<vscode.Uri> {
    const dir = path.join(this.storageRoot || path.join(this.workspaceRoot, ".meldex"), "diffs");
    fs.mkdirSync(dir, { recursive: true });
    const fullPath = path.join(dir, name.replace(/[^\w.-]/g, "_"));
    fs.writeFileSync(fullPath, content, "utf8");
    return vscode.Uri.file(fullPath);
  }
}
