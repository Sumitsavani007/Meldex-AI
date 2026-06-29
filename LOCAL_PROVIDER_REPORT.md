# Local Provider Report

Date: 2026-06-29

## Provider Layer

Meldex AI Studio image generation is wired to the local ComfyUI SDXL provider.

Active provider:

- `local_comfyui_sdxl`

Disabled provider:

- `local_comfyui_flux_schnell`

## Config Keys

- `COMFYUI_BASE_URL`
- `STUDIO_SDXL_WORKFLOW`
- `STUDIO_FLUX_SCHNELL_WORKFLOW`
- `FFMPEG_PATH`

## Behavior

- Text-to-image requests select SDXL Turbo.
- Reference modes also route to SDXL for now instead of FLUX.
- FLUX returns a clear disabled message because this 8GB Mac cannot safely run it.
- Local ComfyUI status is checked through `/system_stats`.
- Workflow submission uses ComfyUI `/prompt`.
- Outputs are read from ComfyUI `/history` and returned as `/view` URLs.

## Files Changed

- `lib/ai-studio-image-provider.ts`
- `lib/ai-studio-providers.ts`
- `app/studio/page.tsx`
- `app/api/studio/image/generate/route.ts`
- `app/api/admin/master/settings/route.ts`
- `app/api/admin/master/sync-env/route.ts`
- `next.config.ts`
- `.gitignore`
- `ai-runtime/Workflows/sdxl-turbo-low-memory.json`

## Build Verification

- `npx tsc --noEmit`: passed.
- `npm run build`: passed with existing workspace React hook warnings.

## Production Limitation

AWS cannot reach a Mac-local `127.0.0.1:8188` ComfyUI server. A reachable `COMFYUI_BASE_URL` is required for live AWS image generation.
