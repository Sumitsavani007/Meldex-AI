# Global UI QA Report

Date: 2026-06-30

## Automated QA

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with existing workspace hook warnings only.
- `npm run build`: passed.

## Manual/Code QA Covered

- Local production server started on `http://localhost:3100`.
- `/` returned HTTP `200`.
- `/login` returned HTTP `200`.
- `/dashboard` returned HTTP `302` to login while logged out.
- `/studio` returned HTTP `302` to login while logged out.
- Logged-out public header remains public-only.
- Protected pages use middleware redirects.
- Dashboard uses shared shell.
- Workspace overview uses shared shell.
- AI Studio uses shared shell and no longer creates a duplicate Meldex-level header/sidebar.
- Settings pages continue through `UserPanelShell`, now backed by `AppShell`.
- Desktop sidebar collapse/hover behavior is implemented.
- Mobile drawer behavior is implemented.

## Known Warnings

- Existing React hook dependency warnings remain in workspace files:
  - `app/workspace/workspace-client.tsx`
  - `app/workspace/workspace-index-client.tsx`

These warnings existed before this shell pass and did not block production build.

## Local Environment Note

- Local protected-route redirects use the configured `NEXTAUTH_URL` from `.env.local`, which is currently `http://localhost:3001`; this is expected when testing the production server on a temporary port.
