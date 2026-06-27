# Meldex IDE Routing Report

Date: 2026-06-27

## Changes

- `/workspace` remains the workspace list.
- Workspace cards now open `/workspace/[projectId]/ide` directly.
- Dashboard create/recent/activity workspace links now open `/workspace/[projectId]/ide`.
- `/workspace/[projectId]` now redirects to `/workspace/[projectId]/ide`.
- Old workspace UI is preserved only as `/workspace/[projectId]/classic`.
- Added protected IDE session API: `POST /api/workspaces/[id]/ide-session`.

## Security

- The IDE page still verifies login and workspace ownership before rendering.
- The IDE session API also verifies login and workspace ownership before starting/reusing a container.

## Status

READY
