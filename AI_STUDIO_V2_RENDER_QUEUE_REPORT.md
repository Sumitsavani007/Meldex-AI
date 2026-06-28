# AI Studio V2 Render Queue Report

Date: 2026-06-29

## Implemented

- Added `POST /api/studio/render`.
- Render requests require auth and project ownership.
- Render requests create `StudioJob` records.
- Missing providers create a failed job with stage `PROVIDER_NOT_INSTALLED`.
- Installed/running providers create queued jobs without faking output URLs.

## Render Modes

- `storyboard_images`
- `draft_preview`
- `final_render`
- `voice`
- `music`
- `sound_effects`
- `lip_sync`
- `subtitles`
- `translation`
- `export`

## No Fake Success

If FLUX, Wan, XTTS, MusicGen, AudioGen, LatentSync, Whisper, NLLB, FFmpeg, or ComfyUI is not configured, the API returns:

`Provider Not Installed`

and does not create fake media output.

