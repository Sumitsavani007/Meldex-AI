# Workspace BookNest E2E QA Report

Date: 2026-06-28

## Test Setup

- Created authenticated test user through live auth.
- Created live workspace: `BookNest E2E QA 2`
- Assigned test user to `Meldex Plus` to allow agent execution.
- Prompt:

`Create a clean premium landing page for "BookNest AI", an AI-powered book summary app.`

## Stream Result

- Stream completed successfully.
- Events received: `194`
- Required events present:
  - `understanding_request`
  - `provider_smoke_test`
  - `model_request_started`
  - `model_response_received`
  - `file_write_started`
  - `file_saved`
  - `preview_started`
  - `preview_verified`
  - `speed_benchmark`
  - `done`

## File Verification

- `index.html`: HTTP `200`, length `5831`, contains `BookNest AI`
- `style.css`: HTTP `200`, length `6958`
- `script.js`: HTTP `200`, length `1163`

Old-content checks:

- FitFlow content: not found
- Tasty Gujarat content: not found
- Meldex Pricing content: not found

## Preview Verification

- Preview endpoint: HTTP `200`
- Preview body contains `BookNest AI`
- CSS asset endpoint: HTTP `200`, length `6958`
- JS asset endpoint: HTTP `200`, length `1165`

## Result

BookNest live authenticated E2E generation passed.
