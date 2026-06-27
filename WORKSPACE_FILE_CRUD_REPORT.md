# Workspace File CRUD Report

Date: 2026-06-27

## APIs

- `GET /api/workspaces/[id]/files`: returns real workspace tree.
- `GET /api/workspaces/[id]/files?path=...`: returns file content.
- `POST /api/workspaces/[id]/files`: creates files and folders.
- `PATCH /api/workspaces/[id]/files`: renames/moves files and folders.
- `PATCH /api/workspaces/[id]/files/[fileId]`: saves file content.
- `DELETE /api/workspaces/[id]/files/[fileId]`: deletes a file.
- `DELETE /api/workspaces/[id]/files?path=...`: deletes a folder/path.

## Security

- Auth is required.
- Workspace ownership is enforced.
- Path resolution uses the existing workspace path guard.
- Secret-like paths remain blocked by the existing workspace file policy.

