# Plan System Report

Date: 2026-06-30

## What Was Built

- Dashboard now shows credit-focused SaaS metrics instead of raw API cost:
  - remaining credits
  - used credits
  - monthly credits
  - purchased credits
  - estimated remaining generations
- Existing dynamic `Plan`, `UserPlan`, `UsageWindow`, and `CreditTransaction` models are used as the source of truth.
- AI Studio pre-check uses the user's current plan limits and credit balance before starting generation.
- Admin usage pricing reset now seeds AI Studio image/video pricing config alongside the existing coding model config.

## Plan Architecture

- Monthly credits continue to come from DB plan limits.
- Purchased/bonus credits are tracked through credit transaction metadata and do not expire.
- Credit consumption order is monthly first, then purchased/bonus.
- Provider cost and visible user credits remain separated by the credit engine.

## Verification

- Dashboard build verified.
- `/api/usage` now returns normalized credit balance data from the shared credit engine.
- Credit estimate API compiles as a protected authenticated route.

## Remaining Notes

- Dedicated DB columns for plan names like Starter/Pro/Business/Enterprise, max resolution, and max video length were not added because the existing plan system already stores dynamic limits and this task asked for architecture without changing payment plan UI.
