# Real Credit Engine Report

Date: 2026-06-27

## Scope

Implemented real credit calculation and deduction for Workspace AI actions without adding a payment gateway or changing unrelated UI.

## What Changed

- Added a reusable credit calculator in `lib/plans-credits.ts`.
- Calculator supports input, output, reasoning, cached tokens, tool calls, file reads/writes, preview runs, memory reads/writes, retries, and autofixes.
- Workspace stream and non-stream agent routes now run a pre-check before model calls.
- Workspace tasks record final usage after generation with provider/model/token metadata and task details.
- Retries, autofixes, preview verification, tools, file writes, and memory usage are included in task total credits.
- AI panel now shows credits used for the current task and low-limit warnings.

## Guardrails

- `LIMIT_EXCEEDED`, `MODEL_NOT_ALLOWED`, and `CONTEXT_TOO_LARGE` block before OpenRouter calls.
- Provider token usage is used when available.
- Estimated usage is marked when provider usage is unavailable.
- Runtime model is checked against plan-allowed models from DB.

## Verification

- `npx prisma validate` passed.
- `npx prisma generate` passed.
- `npx prisma migrate deploy` passed locally against configured local database.
- `npm run lint` passed with existing warnings only.
- `npm run build` passed.
- DB smoke test confirmed `ModelUsageConfig` exists and default plans allow Qwen3-Coder model ids.
