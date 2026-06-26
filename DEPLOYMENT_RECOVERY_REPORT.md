# Deployment Recovery Report

## GitHub Auth

- Installed GitHub CLI with Homebrew.
- Completed browser/device auth.
- Authenticated account: `Sumitsavani007`.
- Git protocol: HTTPS through `gh auth git-credential`.

## Push Status

- Local branch: `main`
- Latest commit: `5843763 Add extension Google and access token auth`
- Push result: passed.
- Remote updated: `origin/main`.
- No force push was used.

## AWS Deployment

- SSH host: `ubuntu@16.171.165.221`
- Requested path `/var/www/meldex-ai` did not exist.
- Actual production repo path: `/home/ubuntu/meldex-ai`.
- Production repo pulled `origin/main` to commit `5843763`.
- Existing dirty production worktree was preserved in stash:

```text
stash@{0}: On main: pre-deploy-stash-20260626124049
```

Deployment steps completed:

- `git pull origin main`: passed after preserving dirty worktree in stash.
- `npm install`: passed.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed after migration recovery below.
- `npm run build`: passed with warnings only.
- `pm2 restart meldex-ai --update-env`: passed.

PM2 status: `meldex-ai` online.

## Migration

Initial migration attempt failed because Prisma CLI did not load `.env.local` and fell back to the schema default database user.

Fixed by exporting `.env.local` before Prisma commands.

Second migration issue:

```text
20260625120104_add_extension_tokens failed because Conversation.activeBrain already existed.
```

Schema inspection confirmed that migration's objects were already present:

- `Conversation.activeBrain`
- `Conversation.model`
- `Conversation.provider`
- `Message.brain`
- `Message.metadataJson`
- `Message.sourcesJson`
- `SystemSetting`
- `SystemSettingAudit`
- `ExtensionToken`

Safe recovery used:

```bash
npx prisma migrate resolve --applied 20260625120104_add_extension_tokens
npx prisma migrate deploy
```

Final Prisma status:

```text
Database schema is up to date.
```

New tables verified:

- `ExtensionToken`
- `ExtensionDeviceCode`

## Production Verification

Verified:

- `https://meldex.newsyfly.com/settings/tokens`: reachable; unauthenticated request redirects to login.
- `https://meldex.newsyfly.com/api/health`: reachable; database/auth/R2 ok, Ollama degraded.
- `/api/extensions/me` without token: returns 401 `Missing Bearer token`.
- `/api/extensions/model-health` without token: returns 401 `Authorization required`.
- Production build includes extension token routes and `/connect/device`.
- PM2 app is online.

Not fully verified from this shell because no logged-in browser session or extension token was available:

- Google login completion.
- Access token creation through the web portal.
- Token delete through the web portal.
- Extension reconnect with a real token.
- `/api/extensions/me` 200 with a real token.
- `/api/extensions/model-health` 200/provider result with a real token.
- Chat/Agent authenticated calls.

## Extension QA

- Installed latest VSIX into VS Code Stable from:

```text
meldex-vscode-extension/meldex-ai-5.1.2.vsix
```

- Installed extension verified:

```text
meldex-ai.meldex-ai@5.1.2
```

- Bundled CLI path exists and is executable:

```text
/Users/sumitsavani/.vscode/extensions/meldex-ai.meldex-ai-5.1.2/meldex-agent-cli/bin/meldex-agent.js
```

- CLI `--version`: passed.
- CLI `doctor`: passed and reported token missing.
- CLI `doctor --auth`: correctly failed with the configured instruction because no extension token is currently available.

## Remaining Blockers

No deployment blocker remains.

Interactive auth QA still requires a logged-in user session or copied extension token.
