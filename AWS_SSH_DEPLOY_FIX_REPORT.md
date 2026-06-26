# AWS SSH Deploy Fix Report

## Result

Workspace V1 latest GitHub code is deployed live.

## SSH Fix

PEM verified:

```bash
/Users/sumitsavani/Downloads/meldex.pem
```

Permissions fixed:

```bash
chmod 400 /Users/sumitsavani/Downloads/meldex.pem
```

Working SSH user:

```bash
ubuntu@16.171.165.221
```

Users that failed:

- `ec2-user`
- `admin`

## Production Path

Requested path did not exist:

```bash
/var/www/meldex-ai
```

Actual PM2 app path:

```bash
/home/ubuntu/meldex-ai
```

Actual PM2 process:

```bash
meldex-ai
```

## Deployment

Before deploy:

```text
3ca10988b1551ed62beb21ca46a66083ed4d2e8d
```

After deploy:

```text
1d12b2002eda3e63f733c228e92db837a48adcaa
```

Commands completed on AWS:

```bash
git fetch origin main
git pull origin main
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart meldex-ai --update-env
```

Prisma note:

- Initial migration attempt failed because shell env did not load `.env.local`, so Prisma fell back to `postgresql://sumitsavani@localhost:5432/meldex`.
- Rerun with `.env.local` exported succeeded.

Migrations applied:

- `20260626210000_ai_workspace`
- `20260626214500_workspace_task_events`
- `20260626223000_workspace_backend_engine`

## Live Verification

Live API now returns expected auth protection:

```bash
curl https://meldex.newsyfly.com/api/workspaces
```

Result:

```text
401
{"error":"Authentication required"}
```

Other checks:

- `/workspace`: redirects to login.
- `/api/health`: database/auth/workspace/R2 ok; Ollama degraded.
- PM2 `meldex-ai`: online.

## Status

READY WORKSPACE LIVE DEPLOYED
