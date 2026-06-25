import * as vscode from "vscode";
import { MeldexChatProvider } from "./webview/chatPanel";
import { WorkspaceContext } from "./context/workspace";

export function activate(context: vscode.ExtensionContext) {
  console.log("Meldex AI activated");

  const chatProvider = new MeldexChatProvider(context);

  // Register sidebar webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "meldex-ai.chatView",
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Commands
  const cmds: [string, () => void][] = [
    ["meldex-ai.openChat", () => {
      vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
    }],

    ["meldex-ai.explainSelection", () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection);
      const fileName = editor?.document.fileName.split("/").pop() ?? "";
      const prompt = selection
        ? `Explain this code from ${fileName}:\n\`\`\`\n${selection}\n\`\`\``
        : `Explain the file: ${fileName}`;
      chatProvider.sendPrompt(prompt, "chat");
      vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
    }],

    ["meldex-ai.fixFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const fileName = editor.document.fileName.split("/").pop() ?? "";
      const content = editor.document.getText();
      const prompt = `Fix any bugs, errors, or issues in this file (${fileName}):\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``;
      chatProvider.sendPrompt(prompt, "agent");
      vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
    }],

    ["meldex-ai.generateTests", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const fileName = editor.document.fileName.split("/").pop() ?? "";
      const content = editor.document.getText();
      const prompt = `Generate comprehensive tests for this file (${fileName}):\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``;
      chatProvider.sendPrompt(prompt, "agent");
      vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
    }],

    ["meldex-ai.refactorSelection", () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection);
      if (!selection) { vscode.window.showWarningMessage("Select code to refactor"); return; }
      const prompt = `Refactor this code to be cleaner and more maintainable:\n\`\`\`\n${selection}\n\`\`\``;
      chatProvider.sendPrompt(prompt, "agent");
      vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
    }],

    ["meldex-ai.runAgent", () => {
      vscode.window.showInputBox({
        prompt: "Describe what you want the agent to build or fix",
        placeHolder: "e.g. Create a login page with email and password",
      }).then((task) => {
        if (task) {
          chatProvider.sendPrompt(task, "agent");
          vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
        }
      });
    }],

    ["meldex-ai.addDocs", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const fileName = editor.document.fileName.split("/").pop() ?? "";
      const content = editor.document.getText();
      const prompt = `Add comprehensive JSDoc/TSDoc comments to all functions and classes in this file (${fileName}):\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``;
      chatProvider.sendPrompt(prompt, "agent");
      vscode.commands.executeCommand("workbench.view.extension.meldex-sidebar");
    }],
  ];

  cmds.forEach(([id, fn]) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  });

  // Watch active editor to update context in webview
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        chatProvider.updateContext(WorkspaceContext.getActiveFileContext(editor));
      }
    })
  );
}

export function deactivate() {}
