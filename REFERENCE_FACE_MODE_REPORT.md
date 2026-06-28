# Reference Face Mode Report

Date: 2026-06-29

## Implemented Controls

- Modes:
  - Text only
  - My face
  - Couple photo
  - Two face references
  - Character reference
  - Style reference
- Reference upload and preview.
- Identity lock toggle.
- Face similarity slider.
- Reference strength slider.
- Preserve face structure, skin tone, hair, and age toggles.

## Backend

- Reference metadata is validated and persisted.
- Reference mode selects `fal_flux_subject`.
- Uploaded images are validated by mime/data URL shape and size.
