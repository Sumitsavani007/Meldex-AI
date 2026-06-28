# Image Reference System Report

Date: 2026-06-29

## What Changed

- Added multiple image reference upload support.
- Added reference preview cards with remove action.
- Added reference type selector:
  - Face
  - Character
  - Couple
  - Style
- Added identity lock toggle.
- Added face similarity slider from `50` to `100`.

## Persistence

- References are persisted in `StudioProject.settingsJson.imageReferences`.
- Backend records reference metadata and creates `StudioAsset` rows for generation requests.

## Safety

- References are used as metadata and prompt guidance only until a local image provider is configured.
- No fake identity-preserving output is shown.
