# Usage Limit Engine Report

Date: 2026-06-27

## Implemented

- Added `getUserPlanLimits(userId)`.
- Added `checkUserCreditLimit(userId, estimatedCredits)`.
- Added `recordCreditUsage(userId, credits, metadata)`.
- Added helpers for assigning plans, granting credits, and resetting usage.
- Usage windows are maintained for:
  - `FIVE_HOUR`
  - `WEEKLY`
  - `MONTHLY`

## Runtime Enforcement

- Workspace stream endpoint checks credits before generation.
- Workspace non-stream agent endpoint checks credits before generation.
- If a limit is exceeded, AI generation returns `LIMIT_EXCEEDED` with:
  `You’ve reached your Meldex usage limit. Upgrade to Meldex Plus/Pro to continue.`
- Workspace viewing is not blocked.
- Credit usage is recorded after completed generation.

## Files Changed

- `lib/plans-credits.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`
- `app/api/workspaces/[id]/agent/route.ts`
- `app/api/usage/route.ts`

## Verification

- Authenticated `/api/usage` returned Free plan limits:
  - 5-hour `0 / 50`
  - weekly `0 / 300`
  - monthly `0 / 1000`
- Unauthenticated `/api/usage` returns `401`.
- Production migration/build/restart passed.
