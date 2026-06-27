# IDE Security Report

Date: 2026-06-27

## Implemented

- `/workspace/[projectId]/ide` requires Meldex auth.
- Workspace ownership is verified with `getOwnedWorkspaceProject`.
- The route does not expose a public unauthenticated IDE.
- If OpenVSCode is not configured, no fake or public IDE is shown.

## Required Before Production Enablement

- Per-workspace OpenVSCode process or container.
- Per-session connection token.
- Token must not be logged.
- Nginx must proxy websocket upgrades only after Meldex auth/session verification.
- OpenVSCode must mount only the owned workspace folder.
- Terminal must be disabled or sandboxed if raw shell access cannot be safely contained.

## Blocker

Production OpenVSCode service is not deployed/configured yet.

