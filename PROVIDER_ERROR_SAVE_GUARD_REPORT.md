# Provider Error Save Guard Report

Date: 2026-06-28

## Issue

Provider failures or invalid model output could fall back into generated files, causing fake edited files and misleading previews.

## Fix

- Provider failure now emits `provider_failed` and stops before file writes.
- No offline/static fake files are saved after provider failure.
- Empty or invalid model output emits `invalid_model_output` and fails before writes.
- Targeted regeneration with no file actions now fails instead of saving fallback content.

## Verification

- Source-level guard is in `app/api/workspaces/[id]/agent/stream/route.ts`.
- Build passed.
- Deployed commit: `2f64184810f766e0d185a43ffb1c34365432dbef`.
- Provider failure path emits `provider_failed` and throws before file extraction/write loops.

## Expected Result

If OpenRouter/model response fails, the task shows a clean provider failure and does not create `index.html`, `style.css`, `script.js`, or edited-file badges.
