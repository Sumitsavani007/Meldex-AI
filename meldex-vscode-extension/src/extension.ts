import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { MeldexChatProvider } from "./webview/chatPanel";
import { WorkspaceContext } from "./context/workspace";
import { ProcessManager } from "./agent/processManager";
import { MeldexApiClient } from "./api/client";

const BENCHMARK_TOKEN_FILE = "benchmark-token.json";
const INSTALL_DIAGNOSTICS_FILE = "installation-doctor.json";

function maskToken(token: string): string {
  const last4 = token.slice(-4);
  if (token.startsWith("sk-")) return `sk-****${last4}`;
  const prefix = token.includes("_") ? `${token.split("_")[0]}_` : `${token.slice(0, 3)}-`;
  return `${prefix}****${last4}`;
}

function expiryLabel(expiresAt?: string | null): string {
  if (!expiresAt) return "server-managed expiry";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "server-managed expiry";
  return date.toLocaleString();
}

async function copyBenchmarkToken(context: vscode.ExtensionContext): Promise<void> {
  const client = new MeldexApiClient(context.secrets);
  const token = await client.getToken();
  if (!token) {
    vscode.window.showWarningMessage("No Meldex token found. Open Meldex, log in, then run Meldex: Copy Benchmark Token.");
    return;
  }

  try {
    const user = await client.currentUser(token);
    const health = await client.modelHealth(token);
    if (!health.healthy) {
      vscode.window.showErrorMessage(`Meldex model health failed: ${health.provider} ${health.model} is ${health.status}. ${health.message}`);
      return;
    }

    const expiresAt = user.expiresAt ?? null;
    const expiry = expiryLabel(expiresAt);
    const choice = await vscode.window.showWarningMessage(
      `Benchmark token is sensitive. It will be copied to clipboard and exported for the Meldex CLI. Expires: ${expiry}.`,
      { modal: true },
      "Copy Token"
    );
    if (choice !== "Copy Token") return;

    await vscode.env.clipboard.writeText(token);

    await fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true });
    const handoffPath = path.join(context.globalStorageUri.fsPath, BENCHMARK_TOKEN_FILE);
    await fs.promises.writeFile(handoffPath, JSON.stringify({
      token,
      expiresAt,
      backendUrl: client.getApiUrl(),
      exportedAt: new Date().toISOString(),
      source: "Meldex: Copy Benchmark Token",
    }, null, 2), { mode: 0o600 });
    await fs.promises.chmod(handoffPath, 0o600).catch(() => {});

    vscode.window.showInformationMessage(
      `Benchmark token copied (${maskToken(token)}). Expires: ${expiry}. Run: MELDEX_TOKEN=<token> meldex-agent doctor --auth`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to export benchmark token: ${error instanceof Error ? error.message : "token validation failed"}`);
  }
}

async function logoutMeldex(context: vscode.ExtensionContext): Promise<void> {
  const client = new MeldexApiClient(context.secrets);
  await client.clearToken();
  await fs.promises.unlink(path.join(context.globalStorageUri.fsPath, BENCHMARK_TOKEN_FILE)).catch(() => {});
  vscode.window.showInformationMessage("Meldex token cleared.");
}

async function collectInstallationDiagnostics(
  context: vscode.ExtensionContext,
  processManager: ProcessManager
): Promise<Record<string, unknown>> {
  const extensionRoot = context.extensionUri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const health = await processManager.preflight(extensionRoot, workspaceRoot, context.globalStorageUri.fsPath);
  const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as {
    name?: string;
    publisher?: string;
    version?: string;
  };
  return {
    appName: vscode.env.appName,
    extensionId: `${pkg.publisher || "meldex-ai"}.${pkg.name || "meldex-ai"}`,
    extensionVersion: pkg.version || context.extension.packageJSON.version,
    extensionPath: extensionRoot,
    globalStorageUri: context.globalStorageUri.fsPath,
    cliPathUsed: health.cli || null,
    nodePathUsed: health.node || null,
    workspaceRoot: workspaceRoot || null,
    preflightOk: health.ok,
    preflightReason: health.reason || null,
    capturedAt: new Date().toISOString(),
  };
}

async function writeInstallationDiagnostics(
  context: vscode.ExtensionContext,
  processManager: ProcessManager
): Promise<Record<string, unknown>> {
  const diagnostics = await collectInstallationDiagnostics(context, processManager);
  await fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true });
  await fs.promises.writeFile(
    path.join(context.globalStorageUri.fsPath, INSTALL_DIAGNOSTICS_FILE),
    JSON.stringify(diagnostics, null, 2),
    "utf8"
  );
  return diagnostics;
}

async function runDoctorCommand(
  context: vscode.ExtensionContext,
  processManager: ProcessManager
): Promise<void> {
  const diagnostics = await writeInstallationDiagnostics(context, processManager);
  const output = vscode.window.createOutputChannel("Meldex Doctor");
  output.clear();
  output.appendLine("Meldex Doctor");
  for (const [key, value] of Object.entries(diagnostics)) {
    output.appendLine(`${key}: ${String(value)}`);
  }
  output.show(true);
  vscode.window.showInformationMessage(`Meldex Doctor complete: ${diagnostics.appName} ${diagnostics.extensionVersion}`);
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Meldex AI activated");

  const chatProvider = new MeldexChatProvider(context);
  const processManager = new ProcessManager();
  const extensionRoot = context.extensionUri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  void writeInstallationDiagnostics(context, processManager);
  processManager.preflight(extensionRoot, workspaceRoot, context.globalStorageUri.fsPath).then((health) => {
    if (!health.ok) {
      vscode.window.showWarningMessage(
        `Meldex Agent startup check failed: ${health.reason}`,
        "Repair",
        "Open Settings"
      ).then((choice) => {
        if (choice === "Repair") {
          const repaired = processManager.repairBundledCli(extensionRoot);
          if (repaired.ok) vscode.window.showInformationMessage("Meldex Agent CLI repaired. Retry the task.");
          else vscode.window.showErrorMessage(`Meldex repair failed: ${repaired.reason}`);
        } else if (choice === "Open Settings") {
          vscode.commands.executeCommand("workbench.action.openSettings", "meldex");
        }
      });
    }
  });

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

    ["meldex-ai.repairInstallation", () => {
      const repaired = processManager.repairBundledCli(extensionRoot);
      if (repaired.ok) vscode.window.showInformationMessage(`Meldex Agent CLI repaired: ${path.basename(repaired.path ?? "meldex-agent.js")}`);
      else vscode.window.showErrorMessage(`Meldex repair failed: ${repaired.reason}`);
    }],

    ["meldex-ai.doctor", () => {
      void runDoctorCommand(context, processManager);
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

    ["meldex-ai.copyBenchmarkToken", () => {
      void copyBenchmarkToken(context);
    }],

    ["meldex-ai.logout", () => {
      void logoutMeldex(context);
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
