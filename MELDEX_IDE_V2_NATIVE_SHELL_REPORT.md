# Meldex IDE V2 Native Shell Report

Date: 2026-06-27

## Mission

Make the visible IDE experience a Meldex-owned React shell instead of exposing OpenVSCode as the product.

## What Changed

- `/workspace/[projectId]/ide` now renders the native Meldex IDE shell.
- The shell uses the existing workspace backend for projects, files, previews, memory, tasks, and agent streaming.
- OpenVSCode is no longer the primary visible IDE route.
- Existing OpenVSCode session API remains available as an internal engine/fallback integration, but not the user-facing IDE shell.
- The workspace orchestration confidence threshold now allows medium safe tasks to proceed with assumptions instead of incorrectly blocking at score 66.
- Workspace agent parsing now recovers valid file actions when the model nests the JSON file payload inside a summary/result/output string.
- Static website tasks now reject zero-file extraction and generate safe required starter files as an autofix instead of completing with no files.

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
- `app/api/workspaces/[id]/agent/route.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`
- `lib/ai-workspace.ts`
- `lib/workspace-orchestrator.ts`

## Local Verification

- `npm run lint`: passed with existing warnings only.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed, no pending migrations.
- `npm run build`: passed.
- User-facing route string scan for forbidden IDE branding in `app/workspace/workspace-client.tsx` and `/workspace/[projectId]/ide/page.tsx`: clean.

## Live Verification

- GitHub/AWS commit: `d8d0016975867c7952d7d82faa4374d51b0be0b5`.
- AWS deploy completed after exporting the production `DATABASE_URL` from `.env.local`.
- Prisma migrate deploy: passed, no pending migrations.
- Production build: passed.
- PM2 `meldex-ai`: online.
- Nginx config test/reload: passed.
- Authenticated `/workspace/[projectId]/ide` source contains `Meldex IDE` and `Meldex AI`.
- Authenticated IDE source scan contains no user-facing upstream IDE branding strings.
- Live stream task created/updated `index.html`, `README.md`, `script.js`, and `style.css`.
- Live preview returned HTTP 200 and valid HTML, with CSS/JS assets served through the preview endpoint.

## Remaining Issues

- Browser screenshot tooling is unavailable in this environment, so visual QA was limited to authenticated HTML/source inspection and endpoint verification.
- Drag/drop and multi-select are not yet implemented in the native shell. They are not exposed as visible fake controls.
