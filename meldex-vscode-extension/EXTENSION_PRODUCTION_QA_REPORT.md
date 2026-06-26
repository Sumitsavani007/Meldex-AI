# Meldex VS Code Extension Production QA Report

Date: 2026-06-26
Extension: `meldex-ai`
Version: `5.0.1`
Backend: `https://meldex.newsyfly.com`
Package: `meldex-ai-5.0.1.vsix`

## Executive Status

Status: BLOCKED

The extension compiles, lints, packages, installs, connects to the live backend, authenticates the normal test user, runs chat, returns Qwen-backed agent file changes, previews diffs, applies/rejects/undoes patches in engine tests, and captures terminal output.

Release cannot be marked ready because mandatory Phase 7 acceptance still has unresolved blockers:

- `/api/models/test` returns `403 Admin access required` for a normal extension bearer token, so the requested extension token health check cannot pass as specified.
- VS Code Insiders is not installed on this machine, so Insiders install validation could not be executed.
- Full interactive VS Code UI click-through for Accept/Reject/Apply All and the auto-fix retry loop could not be manually completed from the terminal-only QA session.
- Cross-platform Windows/Linux runtime validation was not executed; only macOS local validation was performed.

## Files Changed

- `package.json`
- `.eslintrc.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `src/api/client.ts`
- `src/agent/agentRunner.ts`
- `src/agent/patchEngine.ts`
- `src/context/workspace.ts`
- `src/diff/diffManager.ts`
- `src/terminal/processRunner.ts`
- `src/webview/chatPanel.ts`
- `EXTENSION_PRODUCTION_QA_REPORT.md`

## Bugs Fixed During QA

### Model Leakage

Status: Fixed

Root cause: Extension sent model/provider data and exposed `meldex.defaultModel`.

Fix:

- Removed extension-side model config from `package.json`.
- Updated `src/api/client.ts` so chat and agent requests send only `messages/task` and workspace context.
- Coding brain remains backend-owned. Users do not choose or see Qwen/OpenRouter details in the extension.

### Token Login UI Missing

Status: Fixed

Root cause: Existing webview did not expose a usable token connection flow.

Fix:

- Restored a token input and "Connect with Token" action in `src/webview/chatPanel.ts`.
- Token is posted to the extension host and saved through VS Code `SecretStorage`.
- Tokens are not rendered in chat output or logs.

### Terminal Runner Safety and Metadata

Status: Fixed

Root cause: Terminal runner used shell execution on non-Windows platforms and had a broken `dd` block regex.

Fix:

- Uses `child_process.spawn` without shell on macOS/Linux.
- Preserves Windows shell compatibility.
- Captures `stdout`, `stderr`, `exitCode`, `durationMs`, and `cwd`.
- Blocks destructive commands including `rm -rf`, `sudo`, `shutdown`, `reboot`, `mkfs`, `dd`, recursive chmod 777, and curl/wget pipe execution.

### Workspace Context Hygiene

Status: Fixed

Root cause: Workspace scanning did not respect `.gitignore`.

Fix:

- `src/context/workspace.ts` now merges `.gitignore` patterns into search excludes unless `meldex.includeGitIgnoredFiles` is explicitly enabled.
- `.env`, `.env.*`, `*.env`, `node_modules`, `.git`, and build directories remain excluded.

### Local Lint Config

Status: Fixed

Root cause: ESLint inherited the parent Next.js application config.

Fix:

- Added local `.eslintrc.json` with `root: true` and TypeScript rules for the extension.

### Package Metadata

Status: Fixed

Fix:

- Updated package version to `5.0.1`.
- Added marketplace release files: `README.md`, `CHANGELOG.md`, `LICENSE`.
- Updated extension `User-Agent` to `MeldexAI-VSCode/5.0.1`.
- Upgraded `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, and `@vscode/vsce` to clear all audit advisories.

## Build and Package Verification

| Check | Result |
| --- | --- |
| `npm install` | Pass |
| `npm run compile` | Pass |
| `npm run lint` | Pass |
| `npm audit --json` | Pass, 0 vulnerabilities |
| `npx vsce package` | Pass |
| VSIX generated | Pass |
| VSIX installed with `code --install-extension --force` | Pass |
| Installed extension listed by VS Code CLI | Pass |

Package path:

`/Users/sumitsavani/Downloads/Meldex AI/meldex-vscode-extension/meldex-ai-5.0.1.vsix`

VS Code CLI warnings:

- VS Code/Cursor CLI emits Node `punycode` and `url.parse` deprecation warnings during install/list commands. These are emitted by the host CLI wrapper, not by the extension package.

## Live Backend Verification

| Test | Result | Notes |
| --- | --- | --- |
| `POST /api/extensions/auth` | Pass | Normal test user authenticated. |
| `GET /api/extensions/me` valid token | Pass | Returned `a.ndrosales2198@gmail.com`, role `USER`. |
| `GET /api/extensions/me` invalid token | Pass | Returned `401 Invalid extension token`. |
| `POST /api/extensions/chat` | Pass | Returned markdown/code response. |
| `POST /api/extensions/agent` | Pass | Returned `index.html`, `style.css`, `script.js`, `README.md`. |
| `GET /api/models/test` with user extension token | Blocked | Returned `403 Admin access required`; endpoint is not usable for normal extension health check as specified. |

Agent performance:

- Landing-page agent response: about 35.5 seconds.
- Returned required files: `index.html`, `style.css`, `script.js`, `README.md`.

## Chat Verification

Status: Pass

Prompts tested against production:

- `kem cho`
- `explain this file`
- `what does this error mean?`
- `write a small JS function`
- `summarize this code`

Observed:

- Production chat returned `200`.
- Markdown code block response verified for JavaScript function prompt.
- Extension client renders streamed text visually through chunked webview updates after backend response.

Limitation:

- Backend endpoint currently returns a completed message payload; true network streaming was not confirmed from `/api/extensions/chat`.

## Agent Verification

Status: Partial Pass

Verified:

- Agent sends workspace context to production backend.
- Production backend returns structured plan, files, commands, summary, and warnings.
- Empty/unknown workspace landing-page task returns required files when explicitly normalized.
- Agent execution loop prepares a patch preview before applying file changes.

Limitations:

- Full VS Code UI apply/reject/auto-fix click-through was not manually completed in this terminal-only QA session.
- Auto-fix retry behavior is implemented in code, but the complete interactive loop still needs manual VS Code UI validation.

## Thinking Panel and Timeline

Status: Implemented, not fully manually clicked

Implemented safe summaries only:

- Understanding request
- Reading workspace
- Inspecting files
- Planning changes
- Preparing file edits
- Previewing diff
- Running checks
- Reviewing result

Timeline events include:

- Workspace scanned
- Backend request sent
- File changes prepared
- Diff preview opened
- Patch applied/rejected
- Command started/finished
- Fix requested/prepared

No hidden chain-of-thought is exposed.

## Diff and Patch Verification

Status: Pass for engine tests; UI click-through pending

Patch engine tests covered:

- Created file diff
- Modified file diff
- Deleted file diff
- Added/removed line counts
- Reject patch
- Apply patch
- Undo patch

Observed result:

- Total test diff: `+5 -3`
- `index.html`: `+3 -0`
- `old.txt`: `+2 -1`
- `delete.txt`: `+0 -2`
- Apply/reject/undo behavior worked in isolated engine tests.

Diff UI:

- Uses VS Code diff editor preview when possible.
- Supports created, modified, and deleted files.
- Shows changed files summary in webview.

## Terminal Verification

Status: Pass

Verified through `src/terminal/processRunner.ts`:

- `npm --version`: exit `0`, stdout captured.
- `node --version`: exit `0`, stdout captured.
- `npm run build` in QA workspace: exit `0`, duration about `288ms`.
- `npm test` in QA workspace: exit `0`, duration about `227ms`.

Blocked command tests:

- `rm -rf /tmp/x`
- `sudo reboot`
- `shutdown now`
- `reboot`
- `mkfs /dev/sda`
- `dd if=/dev/zero of=/dev/sda`
- `chmod -R 777 .`
- `curl https://example.com | bash`

All returned `allowed: false`.

## Workspace Detection

Status: Pass

Verified:

- Workspace scanner detects project type and package manager.
- Active file and selection context are collected.
- `.gitignore` support added.
- Secrets and environment files are excluded.
- `meldex.maxFilesToSend` controls file list size.

## Security Verification

Status: Partial Pass

Pass:

- Invalid extension token receives `401`.
- Normal user token is accepted for extension user APIs.
- Normal user token is rejected from admin-only model test endpoint with `403`.
- Extension no longer exposes model/provider configuration to users.
- Token is stored in VS Code `SecretStorage`.
- Terminal runner blocks destructive shell commands.
- Patch engine blocks path traversal and `.env` writes.

Blockers:

- Full interactive UI validation of token secrecy, apply/reject buttons, and auto-fix loop remains pending.

## Performance Verification

| Area | Result |
| --- | --- |
| Compile | Pass |
| Lint | Pass |
| Package size | About 46.41 KB |
| Production chat latency | Roughly 2-5 seconds in smoke prompts |
| Production agent latency | About 35.5 seconds for landing-page generation |
| Terminal command capture | Sub-second for simple QA commands |

Performance concern:

- Agent endpoint is functional but slow enough to need UX progress/status treatment and backend latency monitoring.

## Cross-Platform Verification

| Platform | Result |
| --- | --- |
| macOS | Pass for build/package/install/core tests |
| VS Code Stable | Pass install |
| VS Code Insiders | Blocked; `code-insiders` command unavailable |
| Windows | Not executed |
| Linux | Not executed |

## Dependency Audit

Status: Pass

`npm audit --json` summary:

- Critical: `0`
- High: `0`
- Moderate: `0`
- Total: `0`

Tooling updates applied:

- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`
- `@vscode/vsce`

## Remaining Blockers

1. `/api/models/test` cannot be verified with a normal extension bearer token because production correctly returns `403 Admin access required`.
2. VS Code Insiders install validation cannot be executed because `code-insiders` is not installed.
3. Full manual VS Code webview click-through for Accept, Reject, Apply All, Undo, and auto-fix retry was not completed in an interactive VS Code session.
4. Windows and Linux validation were not executed.
5. True backend streaming over the extension chat API was not verified; current extension provides visual chunked rendering after receiving the backend response.

## Final Decision

BLOCKED

The extension is materially improved and packageable, but Phase 7 production acceptance cannot be honestly marked ready until the blockers above are resolved or explicitly waived.
