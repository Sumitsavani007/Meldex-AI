# Workspace V1 Security Audit Report

## Result

Local Workspace V1 security checks passed for the implemented API layer. Live production security validation is blocked because the current production server does not have the Workspace API deployed.

## Auth + RBAC

- Guest workspace API requests return `401`.
- Normal user can create and access own workspace locally.
- Normal user cannot access another user's workspace; API returned `404`.
- Normal user cannot access admin/master; route redirected.
- Admin metadata inspection support exists through scoped project lookup.

## Path Traversal

- Authenticated traversal attempt against workspace file API returned `400`.
- Storage helper normalizes relative paths.
- Absolute paths and parent traversal are rejected.
- Secret-like paths are blocked.

## Preview Security

Updated preview iframe sandbox:

- `sandbox="allow-scripts"`
- removed `allow-same-origin`
- external preview open link now uses `rel="noopener noreferrer"`

Preview backend serves only workspace-local files through `/api/workspaces/[id]/preview`.

## Secret Redaction

Workspace stream/log helper redacts:

- `mdx_...`
- `sk-...`
- `sk-or-...`
- password/token/api key/secret key-value patterns

## Command Injection / SSRF

- Static preview verification does not execute arbitrary shell commands.
- Preview actions are limited to `start`, `stop`, `refresh`, and `verify`.
- Preview URL is workspace-local.
- Arbitrary external preview URLs are not accepted by the Workspace V1 preview API.

## Rollback Authorization

- Rollback endpoints require authentication.
- Task rollback is scoped to `session.user.id`, workspace ID, and task ID.

## Remaining Risks

- Production live validation is blocked by AWS SSH access.
- Existing lint warnings remain non-critical.
