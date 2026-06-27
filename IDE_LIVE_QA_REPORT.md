# IDE Live QA Report

Date: 2026-06-27

## Live URL

- Protected route: `https://meldex.newsyfly.com/workspace/cmqvmiacu0000mpqkriem6lwf/ide`
- Proxied IDE route: `/ide/cmqvmiacu0000mpqkriem6lwf/`

## QA Results

- AWS commit matches deployed code: `3fd1d907a1fa3e324f121cbc6fd98fff169bccc6`
- `npm install`: completed
- `npx prisma generate`: completed
- `npx prisma migrate deploy`: completed, no pending migrations
- `npm run build`: completed
- PM2 app `meldex-ai`: online
- PM2 app `meldex-openvscode-proxy`: online
- Authenticated IDE page: HTTP `200`
- IDE iframe URL issued: yes, token masked in logs/reports
- First IDE proxy request: HTTP `200`
- Proxy auth cookie set: yes
- Follow-up IDE workbench request: HTTP `200`
- OpenVSCode HTML detected: yes
- Bad token request: HTTP `401`
- Unauthenticated IDE page: HTTP `302` to login
- Target container status: up
- Nginx `/ide/` route configured with WebSocket upgrade headers

## Notes

The test confirmed that the previous `502` was caused by a restart-looping OpenVSCode container and missing subpath handling. Both are fixed.

## Status

READY
