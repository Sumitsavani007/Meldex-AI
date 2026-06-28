# fal.ai FLUX Integration Report

Date: 2026-06-29

## Integration

- Text-only prompts route to `fal-ai/flux/schnell`.
- Face/reference prompts route to `fal-ai/flux-subject`.
- Queue flow submits to `https://queue.fal.run/...`, polls status, then fetches result output.

## Config

Supported secret keys:

- `FAL_KEY`
- `FAL_API_KEY`

These are now available in Master settings and env sync lists.

## AWS Status

- AWS check result: `FAL_CONFIG_MISSING`
- Real online image generation is blocked until a fal.ai key is configured.
