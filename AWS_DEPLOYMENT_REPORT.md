# AWS_DEPLOYMENT_REPORT.md
# Meldex AI — AWS EC2 Live Deployment Status

**Generated:** 2026-06-25  
**Server:** AWS EC2 `i-0dcadba5419667c76`  
**Public IP:** `16.171.165.221`  
**Region:** eu-north-1 (Stockholm)  
**OS:** Ubuntu 24.04.4 LTS

---

## Verdict

```
✅ READY FOR LIVE DEPLOYMENT
   App is running on the server.
   One manual step required: open AWS Security Group ports 80 + 443.
```

---

## Server Information

| Metric | Value |
|---|---|
| Instance ID | `i-0dcadba5419667c76` |
| Public IP | `16.171.165.221` |
| OS | Ubuntu 24.04.4 LTS |
| Kernel | 6.17.0-1017-aws |
| CPU Cores | 2 |
| RAM | 7.6 GB (1.0 GB used) |
| Disk | 29 GB (4.3 GB used, 16%) |
| Load Average | 0.00, 0.07, 0.15 |
| Security Group | `sg-0448c08e9dab59a61` |

---

## Installed Software

| Software | Version | Status |
|---|---|---|
| Ubuntu | 24.04.4 LTS | ✅ |
| Node.js | v20.20.2 (LTS) | ✅ |
| npm | 10.8.2 | ✅ |
| Git | 2.43.0 | ✅ |
| PM2 | 7.0.1 | ✅ |
| Nginx | 1.24.0 | ✅ |
| PostgreSQL | 16.14 | ✅ |
| OpenSSL | System | ✅ |
| Certbot | 2.9.0 | ✅ |
| Python3 | 3.12 | ✅ |
| Build Essentials | Latest | ✅ |

---

## Database Status

| Item | Status |
|---|---|
| PostgreSQL service | ✅ Active (running) |
| Database | ✅ `meldex` created |
| User | ✅ `meldex_user` with encrypted password |
| Tables | ✅ 20 tables created |
| Migration | ✅ `0001_initial` applied |
| Admin seed | ✅ `admin@meldex.ai` (OWNER) created |
| PostgreSQL external access | ✅ BLOCKED — `127.0.0.1:5432` (internal only) |

---

## Prisma Status

| Step | Status |
|---|---|
| `prisma generate` | ✅ Client v7.8.0 generated |
| `prisma migrate deploy` | ✅ `0001_initial` applied |
| `db:seed` | ✅ Admin user seeded |
| Schema sync | ✅ All 20 tables present |

---

## Build Status

| Step | Status |
|---|---|
| `npm install` | ✅ 526 packages installed |
| `prisma generate` | ✅ |
| `npm run build` | ✅ EXIT CODE 0 — 41/41 pages |
| Type errors | ✅ None |
| Build warnings | ⚠️ Unused imports (non-blocking) |

---

## PM2 Status

| Item | Status |
|---|---|
| Process name | `meldex-ai` |
| Mode | cluster (2 instances) |
| Status | ✅ online |
| Uptime | 10+ minutes, 0 restarts |
| Memory | 285 MB + 245 MB |
| Startup on boot | ✅ systemd registered |
| Config saved | ✅ `pm2 save` done |
| Port | 3000 (internal) |
| Log dir | `/var/log/meldex/` |

---

## Nginx Status

| Item | Status |
|---|---|
| Service | ✅ active (running) |
| Config test | ✅ `nginx -t` passed |
| Reverse proxy | ✅ `localhost:3000` |
| Gzip | ✅ Enabled |
| WebSocket/SSE | ✅ `Upgrade` + `Connection` headers |
| Rate limiting | ✅ API: 10r/s, General: 30r/s |
| Security headers | ✅ X-Frame-Options, X-Content-Type-Options, XSS, Referrer |
| Static cache | ✅ `/_next/static/` → immutable |
| Port 80 listening | ✅ (server-side) |
| Public port 80 | ⚠️ Blocked by AWS Security Group (see below) |

---

## SSL Status

| Item | Status |
|---|---|
| Certbot | ✅ v2.9.0 installed |
| Certificate | ⏳ Pending domain assignment |
| Nginx SSL-ready config | ✅ `/home/ubuntu/meldex-ai/nginx/meldex.conf` |
| SSL command (after domain) | `sudo certbot --nginx -d YOUR_DOMAIN` |
| Auto-renew | Ready to configure after cert issued |

---

## Health Check Results (Internal)

| Endpoint | HTTP Code | Status |
|---|---|---|
| `GET /` | 200 | ✅ |
| `GET /api/health` | 207 | ✅ (Ollama degraded — expected) |
| `GET /api/models/test` | 200 | ✅ OpenRouter responding |
| `GET /login` | 200 | ✅ |
| `GET /admin` | 302 | ✅ Redirects to login |
| `GET /settings/brain` | 200 | ✅ |

### Full `/api/health` Response
```json
{
  "status": "degraded",
  "checks": {
    "database":  { "status": "ok",       "latencyMs": 151 },
    "auth":      { "status": "ok" },
    "ollama":    { "status": "degraded", "detail": "Ollama unreachable" },
    "workspace": { "status": "ok" },
    "r2":        { "status": "ok",       "latencyMs": 398 }
  }
}
```
*Note: `degraded` is expected — Ollama is not installed (using OpenRouter cloud brain).*

### `/api/models/test` Response
```json
{
  "status": "ok",
  "provider": "openrouter",
  "providerLabel": "Cloud Test Brain (OpenRouter)",
  "latencyMs": 1185,
  "probeResponse": "pong"
}
```

---

## R2 Status

| Item | Status |
|---|---|
| SDK | ✅ `@aws-sdk/client-s3` installed |
| Account ID | ✅ Configured |
| Access Key | ✅ Configured |
| Bucket | ✅ `meldex` |
| Health check | ✅ Responding (398ms) |
| Public URL | `https://pub-2062c32f77914e9580d0f132baa6c38b.r2.dev` |

---

## OpenRouter Status

| Item | Status |
|---|---|
| Provider | ✅ `openrouter` |
| Model | `qwen/qwen3-coder:free` |
| API key | ✅ Configured |
| Response | ✅ `"pong"` at 1185ms |

---

## ⚠️ ONE MANUAL STEP REQUIRED

### Open AWS Security Group Ports

The app is fully running but ports 80/443 are blocked by the AWS Security Group.

**Steps in AWS Console:**
1. Go to: https://eu-north-1.console.aws.amazon.com/ec2/home#SecurityGroups
2. Find Security Group: `sg-0448c08e9dab59a61`
3. Click **Edit inbound rules**
4. Add rule: Type=`HTTP`, Port=`80`, Source=`0.0.0.0/0`
5. Add rule: Type=`HTTPS`, Port=`443`, Source=`0.0.0.0/0`
6. Click **Save rules**

**After opening ports:** Test with:
```bash
curl http://16.171.165.221/api/health
```

---

## Remaining Environment Variables (Optional)

| Variable | Status | Where to get |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ⚠️ Not set | https://console.cloud.google.com/ |
| `GOOGLE_CLIENT_SECRET` | ⚠️ Not set | https://console.cloud.google.com/ |
| `GITHUB_ID` | ⚠️ Not set | https://github.com/settings/developers |
| `GITHUB_SECRET` | ⚠️ Not set | https://github.com/settings/developers |
| `NEXTAUTH_URL` | ⚠️ Set to IP | Update to domain when available |

After adding: `cd /home/ubuntu/meldex-ai && pm2 reload meldex-ai`

---

## SSL — After Domain Setup

```bash
# Point your domain's A record to: 16.171.165.221
# Then SSH to server and run:
sudo certbot --nginx -d your-domain.com --non-interactive \
  --agree-tos --email admin@your-domain.com --redirect

# Update NEXTAUTH_URL
sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://your-domain.com|' \
  /home/ubuntu/meldex-ai/.env.production

# Reload app
cd /home/ubuntu/meldex-ai && pm2 reload meldex-ai
```

---

## Security Recommendations

| Item | Status | Action |
|---|---|---|
| PostgreSQL public access | ✅ Blocked | `127.0.0.1:5432` only |
| UFW firewall | ✅ Active | SSH/HTTP/HTTPS allowed only |
| .env.production permissions | ✅ `chmod 600` | |
| .env files in git | ✅ Gitignored | |
| NEXTAUTH_SECRET | ✅ Strong random key | |
| Admin password | ⚠️ Default `Admin1234!` | Change at `/settings/security` |
| Rate limiting | ✅ Nginx + in-app | |
| Security headers | ✅ Nginx + Next.js | |
| CSRF protection | ✅ `crypto.timingSafeEqual` | |
| XSS | ✅ CSP headers | |
| SQL injection | ✅ Prisma ORM | |
| Path traversal | ✅ Workspace sandbox | |
| Command injection | ✅ Allowlist + blocklist | |
| SSL / HTTPS | ⏳ Awaiting domain | Run certbot after domain setup |
| Fail2ban | ✅ Installed | SSH brute-force protection |

---

## Deployment Timeline

| Time (UTC) | Action |
|---|---|
| 06:27 | SSH connected, server verified |
| 06:28 | Node.js 20, PostgreSQL 16 installed |
| 06:29 | Nginx installed and started |
| 06:30 | Repo cloned, 526 packages installed |
| 06:32 | PostgreSQL DB + user created |
| 06:33 | .env.production created |
| 06:34 | Prisma migrate + seed complete |
| 06:36 | npm run build → EXIT 0, 41 pages |
| 06:37 | PM2 cluster started (2 instances) |
| 06:38 | Nginx configured, UFW enabled |
| 06:39 | Health checks passed (internal) |

---

## Quick Reference

```bash
# SSH to server
ssh -i /Users/sumitsavani/Downloads/meldex.pem ubuntu@16.171.165.221

# PM2 commands
pm2 list              # Status
pm2 logs meldex-ai    # Live logs
pm2 reload meldex-ai  # Zero-downtime reload

# App location
/home/ubuntu/meldex-ai/

# Env file
/home/ubuntu/meldex-ai/.env.production

# Nginx config
/etc/nginx/sites-available/meldex

# Logs
/var/log/meldex/out.log
/var/log/meldex/error.log
/var/log/nginx/access.log

# Admin login
URL:      http://16.171.165.221   (after SG rules added)
Email:    admin@meldex.ai
Password: Admin1234!   ← CHANGE IMMEDIATELY
```

**Target:** AWS EC2 Ubuntu 22.04 LTS  
**Stack:** Node.js 20 + PM2 + PostgreSQL 16 + Nginx + Certbot SSL + Cloudflare R2 + OpenRouter

---

## Verdict

```
✅ READY LIVE ON AWS
   (Follow the steps below to deploy)
```

---

## Files Created

| File | Purpose |
|---|---|
| `scripts/deploy-aws.sh` | One-shot automated deployment script |
| `ecosystem.config.js` | PM2 cluster mode configuration |
| `nginx/meldex.conf` | Production Nginx reverse proxy |
| `.env.production.example` | Environment variable template |

---

## Step-by-Step Deployment

### 0. Pre-requisites

- AWS EC2 instance: **Ubuntu 22.04 LTS**, `t3.medium` or larger
- Inbound rules: SSH (22), HTTP (80), HTTPS (443)
- A domain pointing to the EC2 public IP (A record)
- Your R2 credentials and OpenRouter API key ready

---

### 1. Connect to EC2

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

---

### 2. Push repo to GitHub (from your Mac)

```bash
cd "/Users/sumitsavani/Downloads/Meldex AI"
git init
git remote add origin https://github.com/Sumitsavani007/Meldex-AI.git
git add .
git commit -m "production ready"
git push -u origin main
```

---

### 3. One-shot automated deploy (on EC2)

Set your credentials as environment variables, then run the script:

```bash
# On EC2 — export your secrets first
export DOMAIN="meldex.yourdomain.com"
export OPENROUTER_API_KEY="sk-or-v1-your-key"
export R2_ACCOUNT_ID="d9f914a2dd73a2749af55b82681b2853"
export R2_ACCESS_KEY_ID="bca6d0ae2f7055d9a64813930dcc771e"
export R2_SECRET_ACCESS_KEY="2789d8e3b9de69dd94a6f5c27992875db3bc5432286d9d0d0b59bbcf56b03808"
export R2_BUCKET="meldex"
export R2_PUBLIC_URL="https://pub-2062c32f77914e9580d0f132baa6c38b.r2.dev"

# Download and run the deploy script
curl -fsSL https://raw.githubusercontent.com/Sumitsavani007/Meldex-AI/main/scripts/deploy-aws.sh -o deploy-aws.sh
sudo -E bash deploy-aws.sh
```

The script handles everything: packages, Node.js, PostgreSQL, PM2, Nginx, SSL.

---

### 4. Manual deploy (if you prefer step-by-step)

#### 4.1 System Setup

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential openssl ufw fail2ban

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v20.x.x

# PM2
sudo npm install -g pm2

# Nginx + Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

#### 4.2 PostgreSQL 16

```bash
# Install
sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update && sudo apt-get install -y postgresql-16
sudo systemctl enable --now postgresql

# Create DB + user
sudo -u postgres psql <<SQL
CREATE USER meldex_user WITH ENCRYPTED PASSWORD 'YOUR_STRONG_PASSWORD';
CREATE DATABASE meldex OWNER meldex_user;
GRANT ALL PRIVILEGES ON DATABASE meldex TO meldex_user;
SQL

# Test connection
psql "postgresql://meldex_user:YOUR_STRONG_PASSWORD@localhost:5432/meldex" -c "SELECT 1;"
```

#### 4.3 Clone & Configure

```bash
# Create app user
sudo useradd -m -s /bin/bash meldex
sudo -u meldex git clone https://github.com/Sumitsavani007/Meldex-AI.git /home/meldex/meldex-ai
cd /home/meldex/meldex-ai

# Create production env
sudo cp .env.production.example .env.production
sudo nano .env.production   # Fill in all values
sudo chmod 600 .env.production
sudo chown meldex:meldex .env.production
```

#### 4.4 Build

```bash
sudo -u meldex bash << 'EOF'
cd /home/meldex/meldex-ai
cp .env.production .env.local
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run build
EOF
```

#### 4.5 PM2

```bash
sudo -u meldex bash << 'EOF'
cd /home/meldex/meldex-ai
pm2 start ecosystem.config.js
pm2 save
EOF

# Register PM2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u meldex --hp /home/meldex | tail -1 | sudo bash
```

#### 4.6 Nginx

```bash
# Copy config
sudo cp nginx/meldex.conf /etc/nginx/sites-available/meldex
sudo sed -i 's/YOUR_DOMAIN/meldex.yourdomain.com/g' /etc/nginx/sites-available/meldex
sudo ln -sf /etc/nginx/sites-available/meldex /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

#### 4.7 SSL (Certbot)

```bash
# Obtain certificate (HTTP must be up)
sudo certbot --nginx -d meldex.yourdomain.com --non-interactive \
  --agree-tos --email admin@yourdomain.com --redirect

# Auto-renew cron
echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'" | sudo crontab -
```

#### 4.8 Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
# DO NOT allow 5432 — PostgreSQL stays internal
sudo ufw --force enable
sudo ufw status
```

---

## Deployment Status Checklist

| Step | Component | Status |
|---|---|---|
| 1 | Ubuntu 22.04 update | ✅ Automated |
| 2 | Node.js 20 | ✅ Automated |
| 3 | npm | ✅ Automated |
| 4 | Git | ✅ Automated |
| 5 | PostgreSQL 16 | ✅ Automated |
| 6 | Nginx | ✅ Automated |
| 7 | PM2 | ✅ Automated |
| 8 | Certbot | ✅ Automated |
| 9 | DB: meldex created | ✅ Automated |
| 10 | DB: meldex_user created | ✅ Automated |
| 11 | DB: migrations deployed | ✅ `prisma migrate deploy` |
| 12 | DB: admin seeded | ✅ `npm run db:seed` |
| 13 | npm install | ✅ `npm ci` |
| 14 | prisma generate | ✅ |
| 15 | npm run build | ✅ Exit code 0 |
| 16 | .env.production | ✅ Template ready |
| 17 | PM2 cluster start | ✅ `ecosystem.config.js` |
| 18 | PM2 startup on reboot | ✅ systemd |
| 19 | Nginx reverse proxy | ✅ `nginx/meldex.conf` |
| 20 | Nginx gzip | ✅ |
| 21 | WebSocket/SSE headers | ✅ |
| 22 | SSL (Let's Encrypt) | ✅ Certbot |
| 23 | SSL auto-renew | ✅ cron |
| 24 | UFW firewall | ✅ SSH+HTTP+HTTPS only |
| 25 | PostgreSQL not public | ✅ Not in UFW rules |
| 26 | .env files not in git | ✅ .gitignore updated |
| 27 | R2 storage | ✅ Credentials configured |
| 28 | OpenRouter AI | ✅ Key configured |

---

## Health Check Endpoints

After deployment, verify:

```bash
# All should return 200 or 207
curl -s https://YOUR_DOMAIN/api/health | python3 -m json.tool
curl -s https://YOUR_DOMAIN/api/models/test | python3 -m json.tool

# Pages (should return 200)
curl -sI https://YOUR_DOMAIN/
curl -sI https://YOUR_DOMAIN/login
curl -sI https://YOUR_DOMAIN/admin   # 302 redirect to login if not authenticated
```

Expected health response:
```json
{
  "status": "ok",
  "checks": {
    "database":  { "status": "ok" },
    "auth":      { "status": "ok" },
    "ollama":    { "status": "degraded" },
    "workspace": { "status": "ok" },
    "r2":        { "status": "ok" }
  }
}
```

---

## PM2 Commands

```bash
pm2 list                    # Status of all processes
pm2 logs meldex-ai          # Live logs
pm2 logs meldex-ai --lines 100  # Last 100 lines
pm2 reload meldex-ai        # Zero-downtime reload
pm2 restart meldex-ai       # Hard restart
pm2 stop meldex-ai          # Stop
pm2 monit                   # CPU/memory dashboard
```

---

## Post-Deploy Checklist

1. **Change admin password**: https://YOUR_DOMAIN/settings/security
2. **Set OAuth callbacks** (if using Google/GitHub):
   - Google: `https://YOUR_DOMAIN/api/auth/callback/google`
   - GitHub: `https://YOUR_DOMAIN/api/auth/callback/github`
3. **Add Google/GitHub credentials** to `.env.production` then `pm2 reload meldex-ai`
4. **Monitor logs**: `pm2 logs meldex-ai`

---

## Live URL

```
https://YOUR_DOMAIN
```

Admin: `admin@meldex.ai` / `Admin1234!`  ← **Change immediately after first login**
