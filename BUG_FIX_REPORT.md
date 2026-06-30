# Bug Fix Report

Date: 2026-06-30

## Fixed

- Removed Hugging Face-specific UI copy from the Image Generator page.
- Added Comfy Cloud provider status to AI Studio provider health.
- Added Master settings and env sync support for Comfy Cloud keys/workflows.
- Ensured prompt enhancement is optional and does not silently run before image generation.
- Ensured provider failures do not create fake success output.
- Added image delete action support in the UI.

## Validation

- `npm run lint` passed with existing warnings.
- `npx tsc --noEmit` passed.
- `npm run build` passed.

## Remaining Issue

- Real image/video generation remains blocked until Comfy Cloud API key and workflow JSON/path values are configured.
