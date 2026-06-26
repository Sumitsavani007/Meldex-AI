# Workspace Architecture Report

## Status

Implemented AI-first Meldex Workspace foundation.

## Routes

- `/workspace`
- `/workspace/[projectId]`

## APIs

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/[id]`
- `POST /api/workspaces/[id]/agent`
- `GET /api/workspaces/[id]/files`
- `GET /api/workspaces/[id]/preview`
- `POST /api/workspaces/[id]/run`
- `POST /api/workspaces/[id]/rollback`
- `GET /api/workspaces/[id]/tasks`

## Storage

Generated workspace files are stored outside the app source tree:

`~/.meldex/workspaces/<userId>/<workspaceSlug>`

Database metadata is stored in new additive Prisma models:

- `WorkspaceProject`
- `WorkspaceFile`
- `WorkspaceTask`
- `WorkspaceRun`
- `WorkspaceDiff`
- `WorkspacePreview`
- `WorkspaceLog`

## Security

- All workspace APIs require authenticated web session.
- Project lookup enforces `userId` ownership.
- File paths are normalized and blocked from escaping project storage.
- Secret-like paths such as `.env`, credentials, and private keys are blocked.
- Preview iframe is same-origin and served with restrictive headers.
- Rollback uses stored diffs for the authenticated project only.

## Migration

Added safe additive migration:

`prisma/migrations/20260626210000_ai_workspace/migration.sql`

No production data deletion or reset required.
