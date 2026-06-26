import * as vscode from "vscode";
import { AgentFileChange, PatchEngine, PatchSummary } from "../agent/patchEngine";

export class DiffManager {
  private readonly patchEngine: PatchEngine;

  constructor(workspaceRoot: string, storageRoot?: string) {
    this.patchEngine = new PatchEngine(workspaceRoot, storageRoot);
  }

  async calculate(files: AgentFileChange[]): Promise<PatchSummary> {
    return this.patchEngine.createPatches(files);
  }

  async showChanges(summary?: PatchSummary): Promise<void> {
    const current = summary ?? this.patchEngine.getSummary();
    if (!current.files.length) return;
    await this.patchEngine.previewPatch();
    void vscode.window.showInformationMessage(
      `Meldex prepared ${current.files.length} file change(s): +${current.totalAdded} -${current.totalRemoved}. Review diffs, then Accept or Reject in the Meldex panel.`
    );
  }

  async openFileDiff(patchId: string): Promise<void> {
    await this.patchEngine.previewPatch(patchId);
  }

  async applyAll() {
    return this.patchEngine.applyPatch();
  }

  async applyOne(patchId: string) {
    return this.patchEngine.applyPatch([patchId]);
  }

  rejectAll() {
    return this.patchEngine.rejectPatch();
  }

  rejectOne(patchId: string) {
    return this.patchEngine.rejectPatch([patchId]);
  }

  async undoLastPatch() {
    return this.patchEngine.undoLastPatch();
  }

  summary() {
    return this.patchEngine.getSummary();
  }
}
