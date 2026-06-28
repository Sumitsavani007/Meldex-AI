# AI Studio V2 Master Architecture Report

Date: 2026-06-29

## Implemented

- Added a local-first AI Studio provider registry.
- Kept Qwen/OpenRouter as the brain only: language understanding, story/script, scene planning, prompt enhancement, camera/lighting/mood/timeline planning.
- Added media-provider abstraction for future local execution without frontend changes.
- Added render-mode requirements for storyboard images, draft preview, final render, voice, music, sound effects, lip sync, subtitles, translation, and export.

## Provider Contract

- Brain: `openrouter`
- Media engine: `comfyui`
- Image: `flux_schnell`, `sdxl`
- Draft video: `wan21_13b`
- Final video: `wan21_14b`
- Voice: `xtts_v2`
- Music: `musicgen`
- Sound effects: `audiogen`
- Lip sync: `latentsync`
- Subtitles: `whisper_large_v3`
- Translation: `nllb`
- Export: `ffmpeg`

## Files Changed

- `lib/ai-studio-providers.ts`
- `lib/ai-studio.ts`
- `app/api/studio/provider/status/route.ts`
- `app/api/studio/render/route.ts`
- `app/api/studio/generate/route.ts`
- `app/studio/page.tsx`

## Result

AI Studio now has a production provider-layer foundation while remaining honest about missing local media runtimes.

