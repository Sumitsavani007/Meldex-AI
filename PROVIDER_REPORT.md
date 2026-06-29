# Provider Report

Date: 2026-06-29

## Active Provider

`local_comfyui_sdxl`

## Disabled Provider

`local_comfyui_flux_schnell`

FLUX is installed but disabled due to the 8GB Mac memory limit and user instruction.

## Meldex Integration

The image generation API now:

- uses SDXL Turbo as the default model,
- submits the configured SDXL workflow to ComfyUI,
- polls ComfyUI history for image outputs,
- returns clean provider errors instead of fake success,
- reports FLUX as disabled.

## CSP

Meldex allows local ComfyUI image URLs:

- `http://127.0.0.1:8188`
- `http://localhost:8188`

## AWS Requirement

For AWS live generation, `COMFYUI_BASE_URL` must be reachable from AWS. A Mac-local `127.0.0.1` endpoint is only reachable from the Mac, not from the AWS server.
