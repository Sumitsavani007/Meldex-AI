# System Report

Date: 2026-06-29

## Runtime

- Runtime location: Samsung T7 external SSD.
- Project no longer depends on a root `ai-runtime` symlink for build.
- `.env.local` keeps absolute local runtime paths for ComfyUI workflows.
- Broken `ai-runtime` symlink was removed from the app root so Next.js build no longer fails when the SSD is unmounted.

## Python

- Python: `3.11.15`
- PyTorch: `2.12.1`
- MPS: available
- ComfyUI: `0.26.0`

## ComfyUI

- Runs on `127.0.0.1:8188` when started locally.
- Output directory points to the Samsung T7 runtime.
- Required SDXL nodes are available through the standard ComfyUI node set.

## Build

- `npx tsc --noEmit`: passed.
- `npm run build`: passed.

## Notes

The external SSD can unmount intermittently. Mount it before starting ComfyUI.
