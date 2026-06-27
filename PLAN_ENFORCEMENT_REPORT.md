# Plan Enforcement Report

Date: 2026-06-27

## Dynamic Limits

Plan limits are read from DB through `getUserPlanLimits`.

Enforced:

- allowed models
- max context tokens
- 5-hour credits
- weekly credits
- monthly credits
- workspace count
- workspace storage size
- parallel Workspace tasks

## Structured Error

Limit checks now return:

- `code: PLAN_LIMIT_EXCEEDED`
- `limitType`
- `currentUsage`
- `limit`
- `resetAt` when applicable
- `recommendedPlan`

## Access Rules

AI generation is blocked when limits are exceeded.

Workspace viewing, files, preview, downloads, and project access remain available.

## Verified Build

- Lint passed.
- Prisma generate passed.
- Migration deploy passed.
- Build passed.
