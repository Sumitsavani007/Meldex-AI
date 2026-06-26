# FOUNDATION ARCHITECTURE REPORT

## Status

READY

## Launch Flow

VS Code Extension -> Extension Host Node -> `ProcessManager` -> safe Node runtime -> bundled `meldex-agent.js` -> backend -> Qwen3-Coder.

The extension no longer launches VS Code, Code Helper, Code Helper (Plugin), or any application bundle executable for agent work.

## Process Architecture

- Added `meldex-vscode-extension/src/agent/processManager.ts`.
- AgentRunner delegates CLI startup to ProcessManager.
- ProcessManager owns launch, monitoring, heartbeat, safe kill, restart limit, and repair.
- CLI launch uses `node <bundled-cli-js> ...args`, never a VS Code executable.

## Node Detection

Runtime priority:

1. `process.execPath` only if it is not Code Helper/Electron/AppTranslocation.
2. `meldex.nodePath` setting.
3. `PATH` lookup for `node` / `node.exe`.
4. Clear user-facing failure.

No macOS, Windows, or Linux application bundle paths are hardcoded.

## CLI Detection

CLI priority:

1. Bundled extension path: `meldex-agent-cli/bin/meldex-agent.js`.
2. Installed CLI on `PATH` when it resolves to a JavaScript file.
3. `meldex.cliPath` setting.

If missing, the extension shows `Meldex Agent CLI not found` and offers repair.

## Crash Recovery

- Heartbeat runs every 10 seconds during managed CLI work.
- Checks Node, CLI, workspace, and storage.
- Restart attempts are capped at 3.
- Stop/cancel kills the process with SIGTERM, then SIGKILL fallback.

## Startup Checks

On activation the extension validates:

- Node runtime
- CLI presence
- Workspace folder
- Storage directory permissions

Failures show a clean warning with Repair/Open Settings actions. Raw `spawn ENOENT` is replaced with user-facing reasons.

## Self Repair

Repair command:

- `Meldex: Repair Agent Installation`

Repair restores the bundled CLI wrapper when missing and verifies compiled CLI output exists.

## Platform Compatibility

The launch system uses only:

- `ExtensionContext.extensionUri`
- `globalStorageUri`
- `workspaceFolders`
- `process.execPath` when safe
- configured paths
- `PATH`
- `path.join()`

This is portable across macOS Intel/Apple Silicon, AppTranslocation cases, Windows Stable/Insiders/portable installs, and Linux package/portable installs.

## Validation

Completed:

- `npm install`
- `npm run compile`
- `npm run lint`
- `npm run build`
- `npx vsce package`
- fresh VSIX install
- CLI smoke test
- source audit for Code Helper/AppTranslocation/hardcoded executable paths

## Remaining Issues

- Backend health is still checked by the existing API client when the user connects; ProcessManager reports backend as unknown during offline startup preflight.
- Full matrix across physical Windows/Linux machines requires device testing, but the code path is platform-neutral.
