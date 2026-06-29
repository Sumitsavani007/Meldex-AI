# Local AI Runtime QA Report

Date: 2026-06-29

## Current Decision

FLUX is installed but disabled. Do not run FLUX on this Mac right now.

Meldex AI Studio is wired to SDXL Turbo low-memory mode.

## Verified

- Samsung T7 runtime was detected earlier at `/Volumes/Sumit SSD/Meldex AI Runtime/ai-runtime`.
- ComfyUI starts with Python `3.11.15`.
- PyTorch `2.12.1` detects MPS.
- ComfyUI `/system_stats` returned HTTP 200 while running.
- SDXL Turbo checkpoint exists:
  - `sd_xl_turbo_1.0_fp16.safetensors`
- SDXL low-memory workflow exists:
  - `sdxl-turbo-low-memory.json`
- Output folder is writable.
- Meldex provider selection routes image generation to `local_comfyui_sdxl`.
- FLUX provider returns a clean disabled message instead of running.
- Next.js production build passed.

## Runtime Adjustment

The SDXL workflow was reduced to:

- `320x320`
- batch `1`
- `1` step
- SDXL Turbo checkpoint

This is intentionally conservative for the MacBook Air M3 with 8GB unified memory.

## Not Completed

Final SDXL PNG verification was intentionally stopped because the user asked to finish wiring first and close VS Code to free memory.

## AWS Note

The deployed AWS app cannot call a ComfyUI process running on the user's Mac at `127.0.0.1`.

For production image generation, `COMFYUI_BASE_URL` must point to a reachable provider URL from the server, such as:

- a ComfyUI service running on AWS, or
- a secure tunnel/public endpoint to the local Mac.

Until then, AWS can show the UI/provider status but cannot generate through the Mac-local runtime.

## Result

Wiring/build is ready. Final image render should be verified after closing VS Code and starting ComfyUI again.
