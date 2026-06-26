# Live User Side QA Report

Date: 2026-06-27

## Local Verification

- `npm run lint`: passed.
- `npx prisma generate`: passed.
- `npm run build`: passed.

## Live Verification Plan

After deploy:

- Verify latest commit on AWS.
- Restart PM2 process.
- Reload nginx so preview iframe header exception applies.
- Check `/dashboard`, `/workspace`, `/chat`, `/settings`, `/settings/tokens`.
- Check unauthenticated protected routes redirect to login.
- Check preview route no longer sends global `X-Frame-Options: DENY`.

## Status

Pending live deployment at report creation time.
