# Phase 1 Live QA Report

Date: 2026-06-28

## Build Verification

- `npm run lint`: passed with existing React hook warnings.
- `npx prisma generate`: passed.
- `npm run build`: passed.
- AWS build: passed.
- PM2 process: `meldex-ai` online.
- Live deployed commit: `06753778ea690439cf0e6b68240f61e82c55e711`

## Live Authenticated Test

Prompt:

`Create a clean premium landing page for "BookNest AI", an AI-powered book summary app.`

Workspace:

- `cmqxo4m1m000lsuqk8g759bhm`

Task:

- `cmqxo7yvl002xsuqkl5y8v7zm`

## Required Event Verification

- `request_received`: present
- `prompt_expanded`: present
- `fast_path_selected`: present
- `context_packed`: present
- `model_request_started`: present
- `model_stream_started`: present
- `model_stream_progress`: present
- `model_response_received`: present
- `parsing_started`: present
- `files_extracted`: present
- `file_write_started`: present
- `file_saved`: present
- `preview_started`: present
- `preview_verified`: present
- `done`: present

## Output Verification

- `index.html`: `5831` bytes, contains `BookNest AI`
- `style.css`: `6958` bytes
- `script.js`: `1163` bytes
- Preview endpoint: `HTTP 200`
- CSS asset endpoint: `HTTP 200`, `6958` bytes
- JS asset endpoint: `HTTP 200`, `1165` bytes

## Old Context Check

- FitFlow content: not found
- Tasty Gujarat content: not found
- Meldex Pricing content: not found

## Timing Verification

- First persisted event: `6ms`
- Model request start: `1737ms`
- Heartbeats: every ~`2s`, max observed gap `2.001s`
- Model response: `51412ms`
- Total task: `53823ms`
- Preview verification: `3ms`

## Notes

One immediately-after-restart client capture showed a cold-start delay before the first streamed chunk, but the persisted live task timeline itself started at `6ms` and subsequent model progress events persisted at 2-second intervals. The runtime path is now instrumented and visible end-to-end.

## Result

Codex UX Phase 1 live runtime QA passed.

