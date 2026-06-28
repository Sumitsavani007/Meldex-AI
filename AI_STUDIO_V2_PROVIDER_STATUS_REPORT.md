# AI Studio V2 Provider Status Report

Date: 2026-06-29

## Implemented

- `POST /api/studio/provider/status` now reads from the provider registry.
- Provider status includes:
  - provider key
  - name
  - category
  - status
  - message
  - version
  - GPU memory
  - queue
  - temperature
  - local-first flag

## Status Values

- `running`
- `installed`
- `stopped`
- `loading`
- `missing`
- `failed`

## Current Expected Production State

- OpenRouter can be running as the current brain.
- Local media providers show `Provider Not Installed` until configured.

