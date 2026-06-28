# Workspace Realtime Streaming Fix Report

Date: 2026-06-28

## Bugs Fixed

- AI panel could remain on a generic thinking state before showing many events at once.
- Nginx/proxy buffering could delay Server-Sent Events.

## Runtime Changes

- Stream starts with explicit stages:
  - Understanding request
  - Expanding native language prompt
  - Loading workspace
  - Reading project structure
  - Ranking/searching relevant files
  - Loading memory
  - Analyzing dependencies
  - Selecting files
  - Creating/editing files
  - Writing chunks
  - Saving
  - Reviewing
  - Running preview
  - Verifying
- SSE response now sets `X-Accel-Buffering: no` and `Cache-Control: no-transform`.
- File generation continues to use real incremental `writeProjectFile` writes, so Explorer and editor updates represent real persisted state.

## Remaining Constraint

The upstream model call itself is still non-streaming through the current model-router completion API. Meldex now streams every runtime stage before and after the provider call, and streams real file writes progressively after file actions are available. True token-by-token model output streaming would require a streaming provider adapter in `model-router`.
