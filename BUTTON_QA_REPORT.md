# Button QA Report

Date: 2026-06-26

## `/admin/master`

Verified by code path and build:
- Save setting: wired to `POST /api/admin/master/settings`
- Replace secret: same save path, owner-only for secrets
- Test connection: wired to `POST /api/admin/master/test`
- Test all: runs all integration tests with per-provider loading state
- Reload config: wired to `POST /api/admin/master/reload-config`
- Sync ENV to Vault: wired to `POST /api/admin/master/sync-env`, owner-only
- Restart app: wired to `POST /api/admin/master/restart`, owner-only, modal confirmation
- Copy masked value: clipboard action with toast feedback
- Refresh health: reloads overview
- Refresh users: reloads users
- Refresh audit: reloads merged audit logs
- User role update: wired to `PATCH /api/admin/users`, owner-only
- Logout: `signOut({ callbackUrl: "/master/login" })`

## Removed/Disabled Behavior

- Raw saved-secret reveal is not exposed.
- Secret updates are disabled for non-owner admins.
- Runtime restart and ENV sync are disabled for non-owner admins.
- Dead `Configure` buttons in `/admin/settings` were replaced with real navigation links.

## Manual QA Limitation

Authenticated click testing inside a browser was not possible in this environment because the in-app browser target was unavailable and no admin session was available. HTTP smoke tests and production build/deploy verification passed.

