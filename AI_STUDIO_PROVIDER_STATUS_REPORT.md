# AI Studio Provider Status Report

Date: 2026-06-28

## Implemented

Added `POST /api/studio/provider/status`.

Displays:

- OpenRouter connected/failed
- ComfyUI not configured
- Wan 2.1 not configured
- FLUX not configured
- SDXL not configured
- XTTS not configured
- FFmpeg not configured

## Rule

Studio does not pretend video was generated without a configured video provider.
