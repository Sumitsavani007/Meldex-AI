# OpenRouter Provider Root Cause Report

Date: 2026-06-28

## Root Cause

OpenRouter credentials and model access were valid, but workspace generation was requesting `max_tokens: 8192`.

OpenRouter rejected that larger request because the current account balance could only afford a much smaller completion budget. The provider returned HTTP `402` with:

`This request requires more credits, or fewer max_tokens. You requested up to 8192 tokens...`

The app previously collapsed this into a generic:

`All configured providers failed: OpenRouter: provider_error`

## Fix

- Added detailed provider error summaries in `lib/model-router.ts`.
- Converted all-provider failures to `insufficient_credits` when all provider failures are credit-related.
- Added affordable-token retry for configured providers when OpenRouter says `can only afford N`.
- Kept the no-fake-success guard: provider failure still stops before file writes.

## Files Changed

- `lib/model-router.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`

## Live Result

- Direct AWS OpenRouter smoke test passed.
- Workspace BookNest E2E task succeeded after retry/repair path.
- Final deployed commit: `dcdac5d30356a0260037a10b1dd7658dddbc9396`.
