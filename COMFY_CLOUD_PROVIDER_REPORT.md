# Comfy Cloud Provider Report

Date: 2026-06-30

## What Changed

- Added a provider-based Comfy Cloud client in `lib/ai-studio-comfy-cloud.ts`.
- Comfy Cloud is now the production-default media provider for AI Studio image and video flows.
- The provider uses the official Comfy Cloud shape:
  - `POST /api/prompt`
  - `GET /api/object_info`
  - `GET /api/view`
  - `X-API-Key` authentication
- Added hot-reloadable Master settings for:
  - `COMFY_CLOUD_API_KEY`
  - `COMFY_CLOUD_BASE_URL`
  - `COMFY_CLOUD_IMAGE_WORKFLOW`
  - `COMFY_CLOUD_IMAGE_WORKFLOW_PATH`
  - `COMFY_CLOUD_VIDEO_WORKFLOW`
  - `COMFY_CLOUD_VIDEO_WORKFLOW_PATH`
  - optional node mapping keys for prompt, negative prompt, width, height, and seed.

## Files Changed

- `lib/ai-studio-comfy-cloud.ts`
- `lib/ai-studio-image-provider.ts`
- `lib/ai-studio-providers.ts`
- `lib/runtime-config.ts`
- `app/api/admin/master/settings/route.ts`
- `app/api/admin/master/sync-env/route.ts`

## Verification

- `npm run lint` passed with existing workspace hook warnings.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Deployed to AWS at commit `618a759`.
- AWS runtime env inspection returned no `COMFY_CLOUD*` keys.

## Remaining Issue

- BLOCKED for real provider QA: no `COMFY_CLOUD_API_KEY`, image workflow, or video workflow was present in local env or AWS runtime.
- Real Comfy Cloud image/video generation cannot be honestly verified until those values are configured.
