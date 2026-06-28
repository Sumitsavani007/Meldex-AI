# AI Studio Working Module Report

Date: 2026-06-28

## Fixed

- AI Studio is no longer only a static mockup.
- Added working project create, select, rename, duplicate, delete, search, recent list, and template loading.
- Added working settings controls with save/persist behavior.
- Added storyboard/timeline scene actions: edit prompt, duplicate, delete, duration update.
- Added copy/export actions for enhanced prompt, scene prompts, negative prompt, and JSON export.

## APIs

- `GET/POST /api/studio/projects`
- `GET/PATCH/DELETE /api/studio/projects/[id]`
- `POST /api/studio/generate`
- `POST /api/studio/scenes/[id]/update`
- `POST /api/studio/provider/status`

## Scope

Coding Workspace was not modified.
