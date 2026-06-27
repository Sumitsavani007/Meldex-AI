# Workspace Extension Runtime Unification Report

Date: 2026-06-28

## Before

- Workspace stream used workspace orchestration.
- Extension agent endpoint built a separate direct LLM prompt.

## After

- Workspace agent calls `askWorkspaceAgent`, which now uses `lib/cli-runtime-v4.ts`.
- Extension agent endpoint now also calls `lib/cli-runtime-v4.ts` for scratchpad, graph, ranking, context packing, confidence, prompt contract, output parsing, and reflection.
- Both surfaces now receive a `runtimeV4` object and use the same Qwen-optimized contract.

## Validation

- Deterministic runtime check confirmed Workspace and Extension both produce `MELDEX CLI RUNTIME V4` prompts and runtime events.

