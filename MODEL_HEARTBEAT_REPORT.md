# Model Heartbeat Report

Date: 2026-06-28

## Issue

The model response can take 50-75 seconds, making the AI panel feel idle if no progress events are emitted.

## Fix

- Added a rotating `model_stream_progress` heartbeat every 2 seconds during the model wait.
- Heartbeat messages include:
  - `Contacting Qwen3-Coder via Novita...`
  - `Waiting for model response...`
  - `Receiving generation...`
  - `Still generating premium layout...`
  - `Preparing files...`
- Each heartbeat includes:
  - `ticks`
  - `timestamp`
  - source marker
- Events are persisted and streamed through the existing SSE event bus.

## Live QA

- Test task: `cmqxo7yvl002xsuqkl5y8v7zm`
- Heartbeat events: `25`
- Max heartbeat gap: `2.001s`
- First heartbeat after model stream started: about `2s`
- No frozen `Thinking` state during the model wait in persisted event flow.

## Result

The Workspace now remains visibly active during long provider/model waits.

