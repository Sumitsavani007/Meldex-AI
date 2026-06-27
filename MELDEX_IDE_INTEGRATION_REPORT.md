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

If OpenVSCode is configured, the route embeds the IDE and provides an open-in-new-tab action.

If OpenVSCode is not configured, the route shows a secure blocked/setup state instead of fake IDE UI.

## Not Done Yet

- OpenVSCode Server is not running on AWS yet.
- Nginx websocket reverse proxy is not configured yet.
- Per-workspace launch/session manager is not implemented yet.

