# FLUX Disabled + SDXL Provider Report

Date: 2026-06-29

## Decision

FLUX remains installed but is disabled for execution.

Reason:

- MacBook Air M3 has 8GB unified memory.
- FLUX previously stalled and risked system instability.
- User explicitly instructed not to run FLUX now.

## SDXL Low-Memory Mode

SDXL Turbo is now the active local provider path.

Workflow:

- checkpoint: `sd_xl_turbo_1.0_fp16.safetensors`
- size: `320x320`
- batch: `1`
- steps: `1`
- sampler: `euler`
- scheduler: `karras`

## Meldex Wiring

- AI Studio model dropdown defaults to `SDXL Turbo`.
- Image API defaults to `SDXL Turbo`.
- Provider selection always chooses `local_comfyui_sdxl`.
- FLUX provider reports disabled/missing and does not execute.
- CSP allows local ComfyUI image URLs for local use.

## Verification

- TypeScript check passed.
- Production build passed.
- ComfyUI health and model discovery passed while the T7/runtime was mounted.

## Remaining Verification

Final SDXL PNG render should be run after VS Code is closed to free memory.
