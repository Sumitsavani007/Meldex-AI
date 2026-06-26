# Workspace V1 Security Report

## Ownership

- Workspace project APIs require authentication.
- Workspace file APIs require authentication.
- Workspace task APIs require authentication.
- New workspace records include `userId` ownership.
- Lookups scope by `session.user.id` and project ID.
- Soft-deleted projects are excluded from normal owned project access.

## Path Traversal Protection

- Relative paths are normalized.
- Absolute paths are blocked.
- Parent traversal is blocked.
- Resolved file paths must remain inside the workspace storage root.

## Secret Redaction

- Stream event messages and payloads redact:
  - `mdx_...`
  - `sk-...`
  - `sk-or-...`
  - token/password/api key/secret query-style values

## Command Safety

- Workspace preview verification does not execute user-supplied shell commands.
- Preview actions are limited to `start`, `stop`, `refresh`, and `verify`.
- The current implementation uses static preview verification only.

## Rollback Safety

- Agent tasks create a snapshot before file edits.
- Rollback restores the pre-task snapshot.
- Diff rollback remains as compatibility fallback for older tasks.

## Remaining Blocker

Database migration could not be applied locally because Prisma schema engine was killed with SIGKILL during `can-connect-to-database`.

Protected API behavior and cross-user isolation need live QA after migration is successfully applied to the target database.
