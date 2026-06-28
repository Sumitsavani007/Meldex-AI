# Prompt Match Detector Fix Report

Date: 2026-06-28

## Bug

The context-leak detector treated generic prompt words as required subjects. Examples included:

- requirements
- pricing
- page
- platform
- website
- section

That caused valid tasks like `Create a premium SaaS platform called FitFlow AI` to fail with false missing-subject errors.

## Fix

- Added a generic stopword list for prompt subject extraction.
- Split prompt matching into:
  - `requiredEntities`
  - `optionalRequirements`
  - `designRequirements`
  - `validationHints`
- Required entities are now real brand/domain terms such as:
  - `FitFlow AI`
  - `Tasty Gujarat`
  - `Meldex`
  - `Gujarati food delivery context`
  - `FitFlow AI fitness context`
- Pricing is required only when the prompt specifically asks for pricing, plans, billing, subscription, monthly, or yearly content.
- Optional missing sections now produce repair hints instead of hard blocking.
- User-facing stream errors now show clean text like `Output needs repair` instead of raw detector internals.

## Files Changed

- `lib/ai-workspace.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`

## Verification

- `npm run lint` passed with existing React hook warnings only.
- `npm run build` passed.
