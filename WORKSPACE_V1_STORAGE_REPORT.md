# Workspace V1 Storage Report

## Storage Root

Workspace storage now resolves in this order:

1. `WORKSPACE_STORAGE_DIR`
2. `MELDEX_WORKSPACE_ROOT`
3. `~/.meldex/workspaces`

This keeps generated workspace files outside the application source tree by default.

## File Safety

- Workspace paths are normalized before use.
- Absolute paths are rejected.
- `..` path traversal is rejected.
- Windows drive-style paths are rejected.
- Secret-like paths such as `.env`, `secret`, `credential`, and `private-key` are rejected.
- File resolution checks that the final absolute path remains inside the project storage root.

## Snapshots

- A snapshot is created before each agent task.
- Snapshot records are stored in `WorkspaceSnapshot`.
- Snapshot payload stores safe relative file paths and contents.
- Task rollback restores from the pre-task snapshot when available.
- Older tasks without snapshots still use diff fallback rollback.

## Preview Storage

Preview records now include:

- `userId`
- `url`
- `port`
- `status`
- `verified`
- `httpStatus`
- `lastCheckedAt`
- `logs`

Preview v1 remains a static local workspace preview and does not run arbitrary user commands.

## Future Cloud Storage Readiness

The storage root is centralized, so R2/cloud storage can be added behind the same project/file boundary later without changing public APIs.
