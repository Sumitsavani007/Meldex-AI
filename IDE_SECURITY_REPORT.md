# IDE Security Report

Date: 2026-06-27

## Implemented

- `/workspace/[projectId]/ide` requires Meldex auth.
- Workspace ownership is verified with `getOwnedWorkspaceProject`.
- The route does not expose a public unauthenticated IDE.
- OpenVSCode containers bind to localhost only.
- IDE access requires a short-lived token.
- The Node proxy validates token + workspace before proxying HTTP or websocket traffic.

## Required Before Production Enablement

- Terminal access is native OpenVSCode terminal inside the mounted workspace container. Production hardening should add container resource limits and optional terminal restrictions.

## Blocker

Native Meldex AI extension inside OpenVSCode is still pending.
