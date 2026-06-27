# Meldex IDE File Hygiene Report

Date: 2026-06-27

## Fixed

- Added shared `isUserVisibleWorkspaceFile(path)` filtering.
- Explorer tree now hides internal/runtime files and folders:
  `.meldex`, `.meldex-ide`, `.meldex-ide-server`, `.vscode`, `settings.json`, `.DS_Store`, `node_modules`, `.git`, `.env*`, and hidden session/secret metadata.
- Workspace ZIP export uses the same visibility rule, so internal runtime files are excluded from downloads.
- Client-side search and generated file lists also filter hidden paths.

## Files Changed

- `lib/workspace-file-visibility.ts`
- `lib/ai-workspace.ts`
- `app/api/workspaces/[id]/download/route.ts`
- `app/workspace/workspace-client.tsx`

## Verification

- `npm run lint`: passed with existing warnings only.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed, no pending migrations.
- `npm run build`: passed.

## Remaining

- Runtime files are not deleted. They are hidden/excluded only, as required.
