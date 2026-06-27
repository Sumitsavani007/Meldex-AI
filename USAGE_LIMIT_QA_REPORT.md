# Usage Limit QA Report

Date: 2026-06-27

## Tested Locally

- Prisma schema validation: passed.
- Prisma client generation: passed.
- Migration deploy: passed.
- Lint: passed with existing warnings only.
- Production build: passed.
- DB pricing config smoke test: passed.
- Default plans include runtime-safe Qwen model ids:
  - `qwen/qwen3-coder-30b-a3b-instruct`
  - `qwen/qwen3-coder:free`

## Expected Runtime Behavior

- User under limit can start an AI Workspace task.
- User over 5-hour, weekly, or monthly limit receives `LIMIT_EXCEEDED` before provider call.
- Model not allowed by the user's plan returns `MODEL_NOT_ALLOWED` before provider call.
- Oversized prompt/context returns `CONTEXT_TOO_LARGE` before provider call.
- Successful task records final actual or estimated usage.
- Retry/autofix/preview/tool/file/memory costs are included in final credits.
- AI panel receives `usage_recorded` and updates task credits plus remaining windows.

## Existing Non-blocking Warnings

Lint still reports pre-existing warnings in extension chat and workspace React hook dependency checks. No new blocking lint errors remain.
