# FLUX ComfyUI Provider Layer Report

Date: 2026-06-29

## Provider Architecture

- Image module targets:
  - ComfyUI
  - FLUX.1 Schnell
  - SDXL
- Provider readiness uses existing AI Studio provider registry.
- Required image providers:
  - `comfyui`
  - `flux_schnell`

## Current Behavior

- If ComfyUI/FLUX is not configured, image generation does not fake output.
- The UI displays:
  `Local image provider not configured.`
- Enhanced prompt, negative prompt, reference summary, and provider payload are still generated.

## Future Ready

- The API returns a renderer-ready payload for ComfyUI dispatch once workflow env/config is added.
