# Meldex IDE Live Final QA Report

Date: 2026-06-27

## Local Status

- Lint: passed with existing warnings only.
- Prisma generate: passed.
- Prisma migrate deploy: passed, no pending migrations.
- Build: passed.

## Production Status

- GitHub commit: `2bd2bd6f53a96a99d4574d3688f3b4d885efaf8f`
- AWS commit: `2bd2bd6f53a96a99d4574d3688f3b4d885efaf8f`
- `npm install`: completed.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed, no pending migrations.
- `npm run build`: passed.
- `pm2 restart meldex-openvscode-proxy --update-env`: passed.
- `pm2 restart meldex-ai --update-env`: passed.
- `nginx -t`: passed.
- `systemctl reload nginx`: passed.

## Live QA Checklist

- `/workspace` unauthenticated: redirects to login.
- `/api/workspaces` unauthenticated: `401`.
- `/workspace/[projectId]/ide` unauthenticated: redirects to login.
- `/api/workspaces/[id]/ide-session` authenticated: returned session URL and expiry.
- `/ide/[workspaceId]/` without token: `401`.
- `/ide/[workspaceId]/` with authenticated session token: `200`.
- IDE proxy WebSocket handshake: `101 Switching Protocols`.
- Docker container label: `native-v3`.
- Product metadata inside container: `Meldex IDE`.
- PM2 apps: `meldex-ai` online, `meldex-openvscode-proxy` online.
- `/api/health`: `207`, app reachable with at least one degraded subsystem outside this IDE repair scope.
