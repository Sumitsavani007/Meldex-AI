# Codex Meldex Hybrid Engine Report

## Status

READY MELDEX CODEX HYBRID ENGINE

## Research Source

- Official Codex CLI repository cloned outside the Meldex project:
  `/tmp/meldex-codex-research/codex`
- License reviewed:
  Apache License 2.0, Copyright 2025 OpenAI.
- Integration approach:
  architecture reference only. No Codex source code was copied into Meldex.

## Codex CLI Concepts Reviewed

- `codex-core`: separates business logic from UI surfaces and owns sandbox/tool runtime behavior.
- `codex-protocol`: keeps transport/event types separate from business logic.
- `codex-exec-server`: treats subprocesses as managed lifecycle objects instead of finite shell calls.
- Sandbox policy:
  explicit read/write/network policy, with platform-specific enforcement.
- Patch engine:
  patch application is a guarded tool with reviewable events.
- Approval flow:
  command risk and approval state are modeled separately from execution.
- Task lifecycle:
  task events, command events, patch events, interruption, and completion are first-class protocol concepts.
- Project instructions:
  local instruction files are included as bounded context rather than relying only on file search.
- Context packing:
  selected context is bounded and summarized before model execution.
- Git/process safety:
  destructive commands and git operations are treated as higher-risk actions.

## Meldex CLI Before

- Meldex already kept its own SaaS auth, extension token flow, Qwen3-Coder backend calls, MIL intelligence, tool intelligence, benchmark lab, rollback snapshots, and safe command policy.
- Runtime concerns were concentrated in `src/cli/main.ts`.
- Command classification, context packing, patch scope, and task lifecycle were mostly implicit.

## Hybrid Design

Meldex remains the primary product and runtime owner.

Flow:

```text
Meldex CLI
  -> Codex-style runtime adapter
  -> Meldex tools / MIL / benchmark / rollback
  -> Meldex backend
  -> OpenRouter Qwen3-Coder
```

Kept unchanged:

- Meldex extension identity and UI.
- Meldex access-token / SecretStorage / benchmark token flow.
- Meldex backend endpoints.
- Qwen3-Coder as primary coding model.
- Existing MIL and Tool Intelligence engines.
- Existing rollback and benchmark paths.

## Implemented

Added:

- `meldex-vscode-extension/src/cli/runtime/codexStyleRuntime.ts`

This adapter adds Meldex-native versions of Codex-style concepts:

- task lifecycle events:
  `task_started`, `context_packed`, `project_instructions_loaded`,
  `command_classified`, `approval_required`, `patch_guarded`,
  `rollback_recorded`, `task_interrupted`, `task_completed`
- command classification:
  `validation`, `server`, `install`, `dangerous`, `git`, `read`, `unknown`
- server command separation:
  `npm start`, `npm run dev`, `next dev`, `vite --host`,
  `php artisan serve`, and `python -m http.server` are non-finite server commands.
- project instruction loading:
  `AGENTS.md`, `.meldex/AGENTS.md`, `.meldex/instructions.md`
- bounded context packing for Qwen3-Coder.
- patch guard:
  blocks workspace escape, secret-like paths, static project dependency/server files,
  and broad autofix patches outside the parsed error scope.
- interrupt hook:
  stop-file check before long task phases.

Updated:

- `meldex-vscode-extension/src/cli/main.ts`

Changes:

- creates a runtime adapter per task.
- emits lifecycle events without leaking raw tokens.
- uses packed context and project instructions in Qwen request context.
- applies Codex-style patch guard before rollback/apply.
- applies Codex-style autofix guard before accepting/generated fixes.
- uses runtime command classifier to split validation commands from server commands.
- keeps Meldex command policy and safe mode intact.

## Security Notes

- No raw token is logged or written to report.
- Existing token masking remains in use.
- Secret-like paths remain blocked.
- Static benchmark projects still cannot add Express/package/server files through autofix.
- Dangerous commands still fail through existing safe-mode policy.
- The Codex repository license was reviewed; no source was copied.

## Verification

Commands run:

```sh
npm run compile
npm run lint
npm run package
node out/cli/main.js --version
node out/cli/main.js doctor
```

Results:

- TypeScript compile: passed
- ESLint: passed
- VSIX package: passed
- CLI version: `meldex-agent 5.1.2`
- Doctor: passed
- Auth token source: extension
- Model health: healthy
- Provider: OpenRouter
- Model: `qwen/qwen3-coder-30b-a3b-instruct`
- Packaged VSIX:
  `meldex-vscode-extension/meldex-ai-5.1.2.vsix`

## Remaining Work Before Large Benchmarks

- Run the next 50-task benchmark against the packaged VSIX.
- Watch runtime events for command classification false positives.
- Consider moving more command execution into a managed process runner after benchmark evidence.

