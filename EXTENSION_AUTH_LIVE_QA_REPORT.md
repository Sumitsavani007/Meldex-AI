# Extension Auth Live QA Report

## Status

Live QA is blocked before production deployment.

## Completed Locally

- Prisma schema validates.
- Prisma Client generates.
- Next.js production build succeeds.
- Extension auth/token implementation is committed locally.

## Not Verified Live

- `/settings/tokens` live page after deploy.
- Token creation in production.
- Token raw value shown once in production.
- Token revoke/delete in production.
- Extension access-token login against production.
- `/api/extensions/me` returning 200 with a valid production token.
- `/api/extensions/model-health` returning 200 or a real provider error with a valid production token.

## Exact Blocker

The production deploy cannot start because the local commit is not pushed to GitHub.

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

Until `origin/main` contains commit `5843763` and the earlier local commits, AWS `git pull origin main` will not deploy the extension auth/token system.
