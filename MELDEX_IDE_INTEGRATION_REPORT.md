# Meldex IDE Integration Report

Date: 2026-06-27

## Implemented In Meldex

- Added protected route: `/workspace/[projectId]/ide`.
- The route requires Meldex authentication.
- The route verifies workspace ownership before showing any IDE integration.
- Added `Open IDE` button in the existing Meldex workspace topbar.
- Added environment-based OpenVSCode target support:
  - `MELDEX_OPENVSCODE_URL_TEMPLATE`
  - `MELDEX_OPENVSCODE_BASE_URL`

## Behavior

The route now creates a per-workspace OpenVSCode session using `ensureOpenVSCodeSession`.

Session behavior:

- Verifies Meldex auth.
- Verifies workspace ownership.
- Creates a short-lived token.
- Starts/reuses a Docker OpenVSCode container for the owned workspace folder.
- Embeds `/ide/[workspaceId]/?tkn=...` through the Meldex OpenVSCode proxy.

## Not Done Yet

- Native Meldex AI VS Code extension is not packaged yet. Current agent remains in the Meldex workspace panel.
