# Workspace Full Pipeline Events Report

Date: 2026-06-27

## Required Events

The Workspace stream now emits the following orchestration events during a real task:

- `memory_loaded`
- `intent_detected`
- `task_classified`
- `planner_done`
- `architect_done`
- `designer_done` for website/UI tasks
- `tool_plan_ready`
- `confidence_scored`
- `qwen_generation_started`
- `file_extracted`
- `reviewer_done`
- `security_reviewed`
- `performance_reviewed`
- `preview_verified`
- `finalized`
- `memory_updated`
- `learning_updated`

## Conditional Events

- `debugger_fix_applied` is emitted only when the reviewer blocks the first extracted file set and a targeted fix pass is attempted.
- `reviewer_needs_fix` is emitted before the debugger pass when the first review blocks.

## Notes

- The stream keeps existing progress events such as `thinking`, `plan`, `changes_planned`, `creating_file`, `created_file`, `diff_ready`, `server_starting`, `preview_ready`, `summary`, and `done`.
- Events are persisted through the existing `WorkspaceTaskEvent` path.
- The implementation does not fake the debugger event when no fix is needed.

## Local Verification

- Build completed successfully after event wiring.
- Live verification is required after AWS deployment to prove production runtime execution.

