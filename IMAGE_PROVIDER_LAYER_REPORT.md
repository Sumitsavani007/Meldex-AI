# Image Provider Layer Report

Date: 2026-06-29

## Provider Abstraction

Created image provider abstraction with:

- `textToImage` path through `fal_flux_schnell`
- reference/face path through `fal_flux_subject`
- provider status surface
- future provider slots:
  - `comfyui_flux_schnell_future`
  - `comfyui_sdxl_future`
  - `comfyui_pulid_future`
  - `comfyui_ipadapter_future`

## Routes

- `POST /api/studio/image/provider/status`
- `POST /api/studio/image/generate`

## Clean Failure Behavior

- If `FAL_KEY` / `FAL_API_KEY` is missing, the API returns a clean provider-not-configured state.
- No fake image output is generated.
