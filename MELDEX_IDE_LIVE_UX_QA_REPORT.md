# Meldex IDE Live UX QA Report

Date: 2026-06-27

## Local QA

- Lint passed with existing warnings only.
- Prisma generate passed.
- Prisma migrate deploy passed locally with no pending migrations.
- Production build passed.

## Live QA Plan

After AWS deployment:

- Create/open a workspace.
- Confirm internal files are absent from Explorer/API tree.
- Confirm Code, Preview, and Split modes render.
- Confirm terminal is closed by default and opens from the header button.
- Confirm Chat tab uses compact progress and Activity contains raw events.
- Confirm ZIP export excludes hidden/runtime files.

## Current Status

- GitHub/AWS commit deployed: `8346465f2b2fea7dc251d45053bbc79498422992`.
- AWS deploy path: `/home/ubuntu/meldex-ai`.
- `npm install`: passed with existing npm audit/engine warnings.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed, no pending migrations.
- `npm run build`: passed with existing warnings only.
- `pm2 restart meldex-ai --update-env`: passed.
- `nginx -t` and reload: passed.
- PM2 status: `meldex-ai` online; `meldex-openvscode-proxy` online.

## Live Verification Result

- Authenticated new workspace created for UX hygiene QA.
- Internal files were created intentionally for verification:
  `.cache/runtime.json`, `.vscode/settings.json`, `.meldex-ide-server/data/User/settings.json`, and root `settings.json`.
- Workspace file API tree returned only user project files:
  `index.html`, `script.js`, `style.css`.
- Forbidden visible files/folders: none.
- Workspace file API with `showHidden=1` returned the intentionally created internal files.
- IDE route source contains: `Code`, `Preview`, `Split`, `Terminal`, `CHAT`, `CHANGES`, `ACTIVITY`, `MEMORY`, `RULES`, `Meldex AI`.
- IDE route source forbidden branding scan: none for `OpenVSCode`, `VS Code`, `Ask @vscode`, `Editing evolved`.
- Workspace ZIP contains only `index.html`, `script.js`, `style.css`.
- ZIP forbidden/internal files: none.
- Unauthenticated `/workspace` redirects to `/login`.
- GitHub `origin/main` and AWS production HEAD both match `8346465f2b2fea7dc251d45053bbc79498422992`.

## Remaining

- Browser screenshot tooling is unavailable in this environment, so pixel-level visual QA should still be confirmed manually in the live browser.
