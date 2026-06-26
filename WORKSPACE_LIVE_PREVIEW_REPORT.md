# Workspace Live Preview Report

## Implemented

Static workspace preview is served by:

`GET /api/workspaces/[id]/preview`

Behavior:

- Serves `index.html` by default.
- Serves linked local CSS/JS/assets through the same safe route.
- Verifies `index.html` exists.
- Verifies HTML shape.
- Verifies linked local assets exist.
- Records `WorkspacePreview` and `WorkspaceRun`.

## UI Controls

Preview panel includes:

- refresh
- open in new tab
- copy URL
- stop button placeholder
- verification state

## Current Scope

Static HTML preview is implemented. Full managed Next/Vite cloud server orchestration is scaffolded through `WorkspaceRun`, but not yet a long-running isolated process service. This is intentionally not a browser IDE.
