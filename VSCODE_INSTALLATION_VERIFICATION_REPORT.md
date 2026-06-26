# VS CODE INSTALLATION VERIFICATION REPORT

Run timestamp: 2026-06-26

## Editor Detection

- Cursor CLI: not available on PATH in this shell.
- VS Code Stable CLI: not available as `code` on PATH, but real VS Code Stable was found at:
  - `/Users/sumitsavani/Downloads/Visual Studio Code.app/Contents/Resources/app/bin/code`
- VS Code Insiders CLI: not available on PATH in this shell.
- Running editor process detected:
  - Visual Studio Code Stable process under `Visual Studio Code.app`

## VS Code Stable Extension Listing

Command used:

```sh
"/Users/sumitsavani/Downloads/Visual Studio Code.app/Contents/Resources/app/bin/code" --list-extensions --show-versions | grep meldex
```

Result:

```text
meldex-ai.meldex-ai@5.1.2
```

## VSIX Install

Command used:

```sh
"/Users/sumitsavani/Downloads/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --install-extension "/Users/sumitsavani/Downloads/Meldex AI/meldex-vscode-extension/meldex-ai-5.1.2.vsix" \
  --force
```

Result:

```text
Extension 'meldex-ai-5.1.2.vsix' was successfully installed.
```

## Actual VS Code Stable Diagnostics

The installed extension wrote diagnostics from the real VS Code Stable extension host.

```json
{
  "appName": "Visual Studio Code",
  "extensionId": "meldex-ai.meldex-ai",
  "extensionVersion": "5.1.2",
  "extensionPath": "/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2",
  "globalStorageUri": "/Users/sumitsavani/Library/Application Support/Code/User/globalStorage/meldex-ai.meldex-ai",
  "cliPathUsed": "/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2/meldex-agent-cli/bin/meldex-agent.js",
  "nodePathUsed": "/opt/homebrew/bin/node",
  "workspaceRoot": "/Users/sumitsavani/Downloads/Meldex AI",
  "preflightOk": true,
  "preflightReason": null
}
```

## Installed VS Code Stable Package Check

Installed extension folder:

```text
/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2
```

Installed commands include:

```text
meldex-ai.openChat
meldex-ai.repairInstallation
meldex-ai.doctor
meldex-ai.explainSelection
meldex-ai.fixFile
meldex-ai.generateTests
meldex-ai.refactorSelection
meldex-ai.runAgent
meldex-ai.copyBenchmarkToken
meldex-ai.logout
meldex-ai.addDocs
```

Installed CLI files:

```text
/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2/out/cli/main.js
mode: 755
shebang: #!/usr/bin/env node

/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2/meldex-agent-cli/bin/meldex-agent.js
mode: 755
shebang: #!/usr/bin/env node
```

## Cursor/Codex Isolation Check

- VS Code Stable extension path uses `.vscode`, not `.cursor`.
- VS Code Stable global storage path uses `Application Support/Code`, not `Application Support/Cursor`.
- CLI path used points to:
  - `/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2/meldex-agent-cli/bin/meldex-agent.js`
- It does not point to Cursor or Codex.

## Status

VS Code Stable installation verified.

One limitation: the GUI command palette action `Meldex: Doctor` could not be manually clicked from this non-interactive shell, but the same installed Doctor diagnostics path ran from the VS Code Stable extension host on activation and confirmed `appName = Visual Studio Code`, extension version `5.1.2`, and the installed `.vscode` CLI path.

