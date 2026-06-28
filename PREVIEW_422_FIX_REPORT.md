# Preview 422 Fix Report

Date: 2026-06-28

## Issue

Preview could report HTTP 422 when generated HTML was invalid, blank, raw model text, or missing linked assets.

## Fix

- Empty generated files are rejected before preview.
- Static output completeness is checked before preview.
- Preview verification failure now fails the task instead of marking it as completed with a broken preview.
- Preview verification timing is recorded in the `speed_benchmark` event.

## Verification

- `verifyStaticPreview()` remains the source of render validation.
- Build passed with `/api/workspaces/[id]/preview` intact.
- Deployed commit: `2f64184810f766e0d185a43ffb1c34365432dbef`.
- Live health reports workspace status `ok`.

## Expected Result

Preview is only marked verified when HTML is valid and linked local CSS/JS assets exist and pass validation.
