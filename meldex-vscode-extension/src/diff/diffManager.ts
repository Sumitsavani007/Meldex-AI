import * as vscode from "vscode";
import * as path from "path";

interface FileChange {
  operation: "create" | "edit" | "delete";
  path: string;
  content: string;
  description?: string;
}

export class DiffManager {
  private pendingChanges: FileChange[] = [];

  constructor(private readonly workspaceRoot: string) {}

  async showChanges(
    files: FileChange[],
    onDecision: (accepted: boolean) => Promise<void>
  ): Promise<void> {
    if (!files.length) return;

    this.pendingChanges = files;
    const creates = files.filter(f => f.operation === "create");
    const edits = files.filter(f => f.operation === "edit");
    const deletes = files.filter(f => f.operation === "delete");

    const summary = [
      creates.length && `${creates.length} new file(s)`,
      edits.length && `${edits.length} edit(s)`,
      deletes.length && `${deletes.length} deletion(s)`,
    ].filter(Boolean).join(", ");

    const choice = await vscode.window.showInformationMessage(
      `Meldex Agent: ${summary}`,
      { modal: false },
      "Review Changes",
      "Apply All",
      "Reject"
    );

    if (choice === "Apply All") {
      await onDecision(true);
      return;
    }

    if (choice === "Reject") {
      await onDecision(false);
      return;
    }

    if (choice === "Review Changes") {
      await this.openDiffEditors(files, onDecision);
    }
  }

  private async openDiffEditors(
    files: FileChange[],
    onDecision: (accepted: boolean) => Promise<void>
  ): Promise<void> {
    for (const file of files) {
      if (file.operation === "delete") {
        await vscode.window.showInformationMessage(`Will delete: ${file.path}`, "OK");
        continue;
      }

      const fullPath = path.join(this.workspaceRoot, file.path);
      const existingUri = vscode.Uri.file(fullPath);
      const proposedUri = vscode.Uri.parse(
        `untitled:${path.join(this.workspaceRoot, "MELDEX_PROPOSED_" + path.basename(file.path))}`
      );

      // Create proposed content in an untitled document
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(proposedUri, { overwrite: true, ignoreIfExists: false });
      edit.insert(proposedUri, new vscode.Position(0, 0), file.content);
      await vscode.workspace.applyEdit(edit);

      let left = existingUri;
      let leftTitle = `Current: ${file.path}`;
      let rightTitle = `Proposed: ${file.path}`;

      if (file.operation === "create") {
        leftTitle = `(new file)`;
      }

      await vscode.commands.executeCommand(
        "vscode.diff",
        left,
        proposedUri,
        `${leftTitle} ↔ ${rightTitle}`
      );
    }

    const finalChoice = await vscode.window.showInformationMessage(
      "Apply these changes to your workspace?",
      { modal: true },
      "Apply All",
      "Reject"
    );
    await onDecision(finalChoice === "Apply All");
  }
}
