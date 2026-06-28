# Phase 3 QA Report

Date: 2026-06-28

## Test Setup

- Live site: `https://meldex.newsyfly.com`
- Deployed commit: `450dde75d92ac9f621526fb0aa75df8755ddb1b5`
- Authenticated QA user created through live auth.
- QA user assigned to `Meldex Pro` for agent execution.
- Workspace: `cmqxpvpy500bvkdqkewuf5bcn`
- Task: `cmqxq1cnm00g8kdqk2st9t7v0`

Prompt:

`Create a clean premium landing page for "BookNest AI", an AI-powered book summary app.`

## Event Verification

- `request_received`: `1.289s`
- `single_agent_plan_ready`: `2.620s`
- `smart_file_plan_ready`: `2.620s`
- `adaptive_token_budget_selected`: `2.620s`
- `model_request_started`: `2.835s`
- `model_response_received`: `50.952s`
- `file_write_started`: `3`
- `file_saved`: `3`
- `preview_verified`: `51.697s`
- `speed_benchmark`: `51.902s`
- `done`: `52.124s`

## Adaptive Token Budget

```json
{
  "maxTokens": 5600,
  "category": "premium_static_page",
  "targetRange": "5000-6500",
  "reason": "Premium static website needs richer sections without using the old 8192 default."
}
```

## Speed Benchmark

- Provider smoke: `1226ms`
- Model response: `48312ms`
- Parse: `3ms`
- `index.html` write: `356ms`
- `style.css` write: `322ms`
- `script.js` write: `50ms`
- Preview verify: `3ms`
- Total: `50675ms`
- Model: `Qwen3-Coder 32B / Novita`
- Tokens/sec: `115.91`
- Input tokens: `1657`
- Output tokens: `5600`

## File Verification

Preview file endpoints:

- `index.html`: HTTP `200`, bytes `13980`
- `style.css`: HTTP `200`, bytes `6958`
- `script.js`: HTTP `200`, bytes `1165`

Editor/file-detail API:

- `index.html`: content length `5831`
- `style.css`: content length `6958`
- `script.js`: content length `1163`

## Preview Verification

- Preview endpoint: HTTP `200`
- Preview body contains `BookNest AI`
- CSS asset loads
- JS asset loads

## Old Context Leak Check

- `FitFlow`: not found
- `Tasty Gujarat`: not found
- `Meldex Pricing`: not found
- `BookNest AI`: found in generated HTML and preview

## Result

Authenticated Workspace QA passed. Phase 3 single-agent planning, smart file planning, adaptive token budget, file persistence, and preview verification are live.

