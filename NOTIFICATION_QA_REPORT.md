# Notification QA Report

Date: 2026-06-27

## Local QA

- `npx prisma validate`: passed
- `npx prisma generate`: passed
- `npx prisma migrate deploy`: passed
- `npm run lint`: passed with existing warnings only
- `npm run build`: passed

## Verified Behavior

- Notification schema is valid.
- Notification templates can be seeded at runtime.
- Email provider missing path logs pending delivery and does not throw.
- User panel bell loads from real `/api/notifications`.
- Mark all read and mark read APIs are implemented.
- Preferences API enforces security-critical notifications.
- Master notification template control is implemented.

## Existing Warnings

Unrelated existing warnings remain:

- `app/api/extensions/chat/route.ts`: unused `lastMessage`
- Workspace React hook dependency warnings

## Deployment

Production deployment must run:

`npx prisma migrate deploy`

