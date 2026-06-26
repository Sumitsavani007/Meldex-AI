# Production Deploy Report

Date: 2026-06-26

## Target

- Host: `ubuntu@16.171.165.221`
- App path: `/home/ubuntu/meldex-ai`
- PM2 app: `meldex-ai`
- Public URL: `https://meldex.newsyfly.com`

## Deployment Commands Run

- Selected files copied with `rsync -R`
- `npm install --include=dev`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npm run build`
- `pm2 restart meldex-ai --update-env`
- `pm2 save`

## Build Result

Production build passed.

Notes:
- First production build attempt failed because `autoprefixer` was missing from the production install.
- Fixed by running `npm install --include=dev`.
- Existing unrelated lint warnings remain.

## Smoke Tests

- `/master/login`: `200 OK`
- `/admin/master` guest: `302` to `/master/login?callbackUrl=/admin/master`
- `/api/auth/providers`: Google present
- Google OAuth start: `302` to `accounts.google.com`
- `/api/extensions/model-health` without token: `401`
- `/api/admin/users` without session: `401`
- `/api/admin/master/settings` without session: `401`
- PM2 status: `online`

## Blockers

- GitHub push not completed because remote HTTPS authentication is not configured in this environment.
- Authenticated browser QA remains pending without an admin session.

