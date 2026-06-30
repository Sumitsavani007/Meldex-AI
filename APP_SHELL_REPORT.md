# App Shell Report

Date: 2026-06-30

## What Changed

- Added a shared protected `AppShell` in `components/app-shell.tsx`.
- `AppShell` owns the protected sidebar, header, mobile drawer, theme toggle, notification slot, provider status placeholder, credit placeholder, and account menu.
- `UserPanelShell` now delegates to `AppShell`, keeping existing settings-style pages compatible while removing duplicated shell logic.
- Dashboard and Workspace overview now use the shared shell.
- AI Studio no longer renders its own Meldex-level header/sidebar; it runs inside the shared shell with module-level tabs only.
- Chat was split into a dynamic server wrapper plus client component to avoid static prerender manifest failures.

## Files Changed

- `components/app-shell.tsx`
- `components/user-panel-shell.tsx`
- `app/dashboard/page.tsx`
- `app/workspace/workspace-index-client.tsx`
- `app/studio/page.tsx`
- `app/chat/page.tsx`
- `app/chat/chat-client.tsx`

## Verification

- `npx tsc --noEmit` passed.
- `npm run lint` passed with existing workspace hook warnings.
- `npm run build` passed.

## Remaining Notes

- The coding IDE route keeps its specialized IDE layout to avoid breaking the workspace runtime.
