# Live User Side QA Report

Date: 2026-06-27

## Local Verification

- `npm run lint`: passed.
- `npx prisma generate`: passed.
- `npm run build`: passed.

## Live Verification

- AWS commit: `3001919781594ddf5d9fe1275c96e6316258af7f`
- PM2 process: `meldex-ai` online
- Prisma migration deploy: no pending migrations
- Production build: passed
- Nginx reload: passed

Checked live:

- `/dashboard`: protected route redirects to login when unauthenticated.
- `/workspace`: protected route redirects to login when unauthenticated.
- `/chat`: protected route redirects to login when unauthenticated.
- `/api/workspaces/test-preview-id/preview`: returns `401` unauthenticated and `X-Frame-Options: SAMEORIGIN`, confirming the preview iframe route no longer inherits global `DENY`.

## Status

Live deployment completed.
