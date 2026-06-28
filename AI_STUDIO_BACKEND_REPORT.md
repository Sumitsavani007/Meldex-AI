# AI Studio Backend Report

Date: 2026-06-29

## Existing Backend Used

- `POST /api/studio/projects`
- `GET /api/studio/projects`
- `GET /api/studio/projects/[id]`
- `PATCH /api/studio/projects/[id]`
- `DELETE /api/studio/projects/[id]`
- `POST /api/studio/generate`
- `POST /api/studio/provider/status`
- `POST /api/studio/scenes/[id]/update`

## Auth And Ownership

- Studio APIs use existing authenticated route guards.
- Project routes query by authenticated `userId`.

## UI Integration

- Generation streams real SSE events into the Studio UI.
- Project settings are saved through the existing project patch endpoint.
- Scene controls call the existing scene update endpoint.

