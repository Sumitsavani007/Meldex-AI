# Upgrade Requests Report

Date: 2026-06-27

## Database

Added:

- `UpgradeRequest`
- `UserNotification`

## APIs

Added:

- `GET /api/billing`
- `POST /api/billing`
- `GET /api/admin/upgrade-requests`
- `POST /api/admin/upgrade-requests`

Updated:

- Admin user plan assignment creates notifications.
- Chat and Workspace AI prechecks return structured plan limit errors.

## Master Panel

Master -> Billing shows upgrade request queue with approve/reject actions.

## QA Status

Local build and migration passed. Live QA is performed after AWS deploy.
