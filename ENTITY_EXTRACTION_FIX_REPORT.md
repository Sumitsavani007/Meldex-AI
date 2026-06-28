# Entity Extraction Fix Report

Date: 2026-06-28

## Issue

Workspace validation could require old-memory subjects such as `FitFlow AI`, `Meldex`, or previous pricing-page terms during a new prompt.

Example current prompt:

`Create a clean premium landing page for "BookNest AI", an AI-powered book summary app.`

Only current prompt entities should be required.

## Fix

- Added current-prompt BookNest detection.
- Added `book_summary_app` domain.
- Required entities for BookNest prompts now come only from the current prompt:
  - `BookNest AI`
  - `book summary` context when no explicit product name exists
- Old workspace terms are only treated as leak indicators when they appear in generated output.
- Added `memoryContextOnly` metadata slot to the detector response for clearer separation.

## Files Changed

- `lib/ai-workspace.ts`

## Verification

- `npm run lint` passed.
- `npm run build` passed.

## Result

BookNest prompts no longer require FitFlow/Meldex/Tasty Gujarat as output subjects.
