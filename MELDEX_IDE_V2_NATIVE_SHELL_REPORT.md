# Meldex IDE V2 Native Shell Report

Date: 2026-06-27

## Mission

Make the visible IDE experience a Meldex-owned React shell instead of exposing OpenVSCode as the product.

## What Changed

- `/workspace/[projectId]/ide` now renders the native Meldex IDE shell.
- The shell uses the existing workspace backend for projects, files, previews, memory, tasks, and agent streaming.
- OpenVSCode is no longer the primary visible IDE route.
- Existing OpenVSCode session API remains available as an internal engine/fallback integration, but not the user-facing IDE shell.

## Native Shell Capabilities

- Real workspace explorer from `/api/workspaces/[id]`.
- Real file create, folder create, rename, duplicate, delete, download, copy path.
- Monaco editor with syntax highlighting, dirty state, autosave, manual save, tabs, and fullscreen editor.
- Live preview iframe using `/api/workspaces/[id]/preview`.
- Preview refresh, responsive widths, zoom, open new tab, copy URL, fullscreen preview.
- Right-side Meldex AI panel using `/api/workspaces/[id]/agent/stream`.
- Activity, files, memory, rules, bottom terminal/output/problems/logs/git panels.
- Resizable left/right/bottom panels with local persistence.
- New workspace Meldex onboarding once via localStorage.

## Files Changed

- `app/workspace/[projectId]/ide/page.tsx`
- `app/workspace/workspace-client.tsx`

## Local Verification

- `npm run lint`: passed with existing warnings only.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed, no pending migrations.
- `npm run build`: passed.
- User-facing route string scan for forbidden IDE branding in `app/workspace/workspace-client.tsx` and `/workspace/[projectId]/ide/page.tsx`: clean.

## Remaining Issues

- Browser screenshot tooling is unavailable in this environment, so live visual QA must rely on authenticated HTML/source inspection and endpoint verification unless the user checks browser manually.
