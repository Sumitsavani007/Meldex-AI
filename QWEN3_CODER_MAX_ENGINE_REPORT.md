# QWEN3-CODER MAX ENGINE REPORT

## Status

READY QWEN3-CODER MAX ENGINE

## Context Engine

- Added `src/agent/contextBuilder.ts`.
- Scans workspace with build folders, `node_modules`, `.git`, and secrets excluded.
- Detects framework/package manager and selects task-relevant files instead of sending the whole repo.
- Summarizes large files with head/tail preservation for context budget.
- Caches workspace index metadata for faster repeated tasks.

## Prompt Profiles

Added automatic profile selection:

- `qwen_static_site`
- `qwen_nextjs`
- `qwen_react`
- `qwen_node_api`
- `qwen_php`
- `qwen_python`
- `qwen_debug`
- `qwen_refactor`
- `qwen_tests`
- `qwen_ui_polish`

## Action Protocol

- Added `src/agent/qwenOptimizer.ts`.
- Every coding prompt is wrapped with concise Qwen3-Coder instructions.
- Requires safe reasoning summary, senior plan shape, structured file actions, validation commands, and final summary.
- Weak action JSON is retried once with a repair instruction.

## Self-Review

- Agent reviews generated actions before diff preview.
- Blocks unsafe paths, secret writes, empty file content, and placeholder imports.
- Emits clean UI timeline events instead of noisy raw logs.

## Autofix Loop

- Existing build/server/test retry loop now receives parsed errors and relevant file context.
- Repeated error fingerprints stop after two occurrences.
- Missing dependency installs require confirmation.
- Preview server performs HTTP 200 + HTML verification.

## Model Config

Master Panel keys added:

- `QWEN_TEMPERATURE`
- `QWEN_MAX_TOKENS`
- `QWEN_TIMEOUT_MS`
- `QWEN_RETRY_COUNT`
- `QWEN_CONTEXT_SIZE`
- `QWEN_ACTION_MODE`

VS Code settings added with the same defaults where useful.

## Benchmarks

Benchmark suite added:

- `meldex-vscode-extension/benchmarks/qwen-max-benchmarks.json`

Included tasks cover empty landing pages, Next.js updates, TypeScript fixes, API routes, refactors, tests, build autofix, dependency detection, UI polish, and README generation.

## Speed Improvements

- Relevant-file selection avoids full repo context.
- Fast static landing path is preserved.
- Workspace context is cached and summarized.
- UI events stream early: detected project, selected profile, self-review, checks, and preview verification.

## Remaining Limits

- Server-side JSON repair is still one retry; deeper repair can be added if OpenRouter returns malformed JSON repeatedly.
- Full benchmark automation records are defined but not yet persisted as historical trend data.
- Dependency install approval depends on the VS Code modal flow in extension mode.
