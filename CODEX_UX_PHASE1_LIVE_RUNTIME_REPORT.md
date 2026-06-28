# Codex UX Phase 1 Live Runtime Report

Date: 2026-06-28

## Scope

Implemented runtime UX and perceived-speed tuning for Workspace agent streams without changing the model, router, or overall UI.

## Changes

- Added persisted, timestamped live timeline events:
  `request_received`, `prompt_expanded`, `fast_path_selected`, `context_packed`, `model_stream_started`, `model_stream_progress`, `parsing_started`, and `files_extracted`.
- Existing critical events remain live:
  `model_request_started`, `model_response_received`, `file_write_started`, `file_saved`, `preview_started`, `preview_verified`, and `done`.
- Added compact runtime stats to the Meldex AI panel from `speed_benchmark` / `done` payloads.
- Parallelized pre-stream guard checks to reduce delay before task start.

## Files Changed

- `app/api/workspaces/[id]/agent/stream/route.ts`
- `app/workspace/workspace-client.tsx`
- `lib/ai-workspace.ts`
- `lib/workspace-event-bus.ts`

## Live QA

- Live commit deployed: `06753778ea690439cf0e6b68240f61e82c55e711`
- Test workspace: `cmqxo4m1m000lsuqk8g759bhm`
- Test task: `cmqxo7yvl002xsuqkl5y8v7zm`
- Prompt: `Create a clean premium landing page for "BookNest AI", an AI-powered book summary app.`
- Status: `SUCCEEDED`
- Events persisted: `190`

## Runtime Timings

- First persisted event: `6ms`
- Model request started: `1737ms`
- Model response time: `51412ms`
- Total task time: `53823ms`
- File write times:
  - `index.html`: `122ms`
  - `style.css`: `128ms`
  - `script.js`: `53ms`
- Preview verification: `3ms`

## Result

Workspace now streams meaningful persisted events from task start through model wait, parsing, progressive file writes, preview, and completion.

