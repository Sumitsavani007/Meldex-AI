# Workspace Download ZIP Report

Date: 2026-06-27

## Implemented

- Added `GET /api/workspaces/[id]/download`.
- Streams a real `.zip` archive.
- Preserves folder structure.
- Excludes internal `.meldex` metadata and `.env` files.
- Requires auth and workspace ownership.

