#!/usr/bin/env bash
# =============================================================================
# Meldex AI — AWS EC2 Production Deployment Script
# Target OS : Ubuntu 22.04 LTS
# Run as    : sudo bash deploy-aws.sh
# =============================================================================
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }
info() { echo -e "${CYAN}➜  $*${NC}"; }
die()  { echo -e "${RED}❌  $*${NC}"; exit 1; }

# ── Configuration — edit before running ──────────────────────────────────────
APP_USER="${APP_USER:-meldex}"
APP_DIR="/home/${APP_USER}/meldex-ai"
REPO_URL="https://github.com/Sumitsavani007/Meldex-AI.git"
NODE_VERSION="20"
PG_DB="meldex"
PG_USER="meldex_user"
# PG_PASS is generated below; capture it for .env.production

# ── Guard: must be root ───────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash $0"

# =============================================================================
# STEP 1 — System update
# =============================================================================
info "Step 1/10 — System update"
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git build-essential openssl ca-certificates \
  gnupg lsb-release software-properties-common ufw fail2ban
ok "System packages installed"

# =============================================================================
# STEP 2 — Node.js 20
# =============================================================================
info "Step 2/10 — Node.js ${NODE_VERSION}"
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(\".\")[0].slice(1))')" -lt "$NODE_VERSION" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
fi
node --version && npm --version
ok "Node.js $(node -v) ready"

# =============================================================================
# STEP 3 — PM2
# =============================================================================
info "Step 3/10 — PM2"
npm install -g pm2 --quiet
pm2 --version
ok "PM2 $(pm2 --version) ready"

# =============================================================================
# STEP 4 — PostgreSQL 16
# =============================================================================
info "Step 4/10 — PostgreSQL 16"
if ! command -v psql &>/dev/null; then
  sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
  apt-get update -qq
  apt-get install -y -qq postgresql-16
fi
systemctl enable --now postgresql
ok "PostgreSQL $(psql --version) ready"

# Generate a strong random password
PG_PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9!@#' | head -c 32)"

# Create DB and user idempotently
sudo -u postgres psql -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE USER ${PG_USER} WITH ENCRYPTED PASSWORD '${PG_PASS}';
  ELSE
    ALTER USER ${PG_USER} WITH ENCRYPTED PASSWORD '${PG_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${PG_DB} OWNER ${PG_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DB}')\\gexec
GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};
SQL

DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}"
ok "PostgreSQL DB '${PG_DB}' and user '${PG_USER}' ready"
info "DATABASE_URL: ${DATABASE_URL}"

# =============================================================================
# STEP 5 — Nginx + Certbot
# =============================================================================
info "Step 5/10 — Nginx + Certbot"
apt-get install -y -qq nginx
apt-get install -y -qq certbot python3-certbot-nginx
systemctl enable --now nginx
ok "Nginx $(nginx -v 2>&1 | grep -oP '[\d.]+') and Certbot ready"

# =============================================================================
# STEP 6 — App user + clone repo
# =============================================================================
info "Step 6/10 — App user + clone"
if ! id "${APP_USER}" &>/dev/null; then
  useradd -m -s /bin/bash "${APP_USER}"
  ok "Created user ${APP_USER}"
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  info "Repo already cloned — pulling latest"
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --rebase
else
  sudo -u "${APP_USER}" git clone "${REPO_URL}" "${APP_DIR}"
fi
ok "Repo at ${APP_DIR}"

# =============================================================================
# STEP 7 — .env.production
# =============================================================================
info "Step 7/10 — Writing .env.production"

# Generate NEXTAUTH_SECRET
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# Prompt for domain if not set
DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  echo -e "${YELLOW}Enter your domain (e.g. meldex.yourdomain.com):${NC} " && read -r DOMAIN
fi

cat > "${APP_DIR}/.env.production" <<EOF
# =============================================================
# Meldex AI — Production Environment
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=${DATABASE_URL}

# ── NextAuth ─────────────────────────────────────────────────
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://${DOMAIN}

# ── OpenRouter ───────────────────────────────────────────────
MELDEX_BRAIN_PROVIDER=openrouter
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=qwen/qwen3-coder:free

# ── Ollama fallback ──────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_MODEL=qwen3-coder:30b

# ── Cloudflare R2 ────────────────────────────────────────────
R2_ACCOUNT_ID=${R2_ACCOUNT_ID:-}
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-}
R2_BUCKET=${R2_BUCKET:-meldex}
R2_PUBLIC_URL=${R2_PUBLIC_URL:-}

# ── OAuth (optional) ─────────────────────────────────────────
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GITHUB_ID=${GITHUB_ID:-}
GITHUB_SECRET=${GITHUB_SECRET:-}

# ── Node ─────────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
EOF

chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env.production"
chmod 600 "${APP_DIR}/.env.production"
ok ".env.production written (chmod 600)"

# =============================================================================
# STEP 8 — Install deps, build, migrate, seed
# =============================================================================
info "Step 8/10 — npm install + build + migrate"

cd "${APP_DIR}"

# Copy env for build step
cp .env.production .env.local

sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npm ci --prefer-offline 2>&1 | tail -3"
ok "npm install done"

sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npx prisma generate 2>&1 | tail -3"
ok "prisma generate done"

sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npx prisma migrate deploy 2>&1"
ok "prisma migrate deploy done"

sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npm run db:seed 2>&1 | tail -5" || warn "Seed skipped (admin may already exist)"

sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npm run build 2>&1 | tail -10"
ok "npm run build done"

# =============================================================================
# STEP 9 — PM2
# =============================================================================
info "Step 9/10 — PM2 start"

# Write ecosystem file
cat > "${APP_DIR}/ecosystem.config.js" <<'ECOSYSTEM'
module.exports = {
  apps: [
    {
      name: "meldex-ai",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      instances: "max",
      exec_mode: "cluster",
      env_file: ".env.production",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "1G",
      error_file: "/var/log/meldex/error.log",
      out_file: "/var/log/meldex/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
      watch: false,
    },
  ],
};
ECOSYSTEM

mkdir -p /var/log/meldex
chown "${APP_USER}:${APP_USER}" /var/log/meldex

sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pm2 delete meldex-ai 2>/dev/null || true"
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pm2 start ecosystem.config.js"
sudo -u "${APP_USER}" bash -c "pm2 save"

# Enable PM2 startup on reboot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" | tail -1 | bash
ok "PM2 started and startup registered"

# =============================================================================
# STEP 10 — Nginx reverse proxy
# =============================================================================
info "Step 10/10 — Nginx config"

cat > "/etc/nginx/sites-available/meldex" <<NGINX
# Meldex AI — Nginx reverse proxy
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Redirect HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # SSL — Certbot will fill these in
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # ── Security headers ──────────────────────────────────────────────────
    add_header X-Frame-Options          "DENY"                      always;
    add_header X-Content-Type-Options   "nosniff"                   always;
    add_header X-XSS-Protection         "1; mode=block"             always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ── Gzip compression ──────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json
               application/javascript application/xml+rss
               application/atom+xml image/svg+xml;

    # ── Client limits ─────────────────────────────────────────────────────
    client_max_body_size 50M;

    # ── Reverse proxy to Next.js ──────────────────────────────────────────
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket / SSE support (chat streaming)
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_read_timeout  300s;
        proxy_send_timeout  300s;
        proxy_connect_timeout 60s;

        # Don't cache API responses
        proxy_cache_bypass \$http_upgrade;
    }

    # ── Static assets — cache aggressively ───────────────────────────────
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
        proxy_set_header Host \$host;
    }

    # ── Favicon / robots ─────────────────────────────────────────────────
    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }
}
NGINX

ln -sf /etc/nginx/sites-available/meldex /etc/nginx/sites-enabled/meldex
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
ok "Nginx configured for ${DOMAIN}"

# =============================================================================
# FIREWALL
# =============================================================================
info "Configuring UFW firewall"
ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh     > /dev/null
ufw allow http    > /dev/null
ufw allow https   > /dev/null
# PostgreSQL is NOT exposed externally
ufw --force enable > /dev/null
ok "UFW enabled — SSH/HTTP/HTTPS allowed, PostgreSQL blocked externally"

# =============================================================================
# SSL — Certbot
# =============================================================================
info "Obtaining SSL certificate for ${DOMAIN}"
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
  --email "admin@${DOMAIN}" --redirect || warn "Certbot failed — run manually: certbot --nginx -d ${DOMAIN}"

# Auto-renew cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | sort -u | crontab -
ok "SSL auto-renew cron installed"

# =============================================================================
# HEALTH CHECK
# =============================================================================
info "Running health checks (waiting 5s for PM2 startup)..."
sleep 5

check_endpoint() {
  local url="$1"
  local code
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time 10)
  if [[ "$code" == "200" || "$code" == "207" ]]; then
    ok "$url → HTTP $code"
  else
    warn "$url → HTTP $code"
  fi
}

check_endpoint "http://localhost:3000/"
check_endpoint "http://localhost:3000/api/health"
check_endpoint "http://localhost:3000/login"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          MELDEX AI — DEPLOYMENT COMPLETE                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐  Live URL   : ${CYAN}https://${DOMAIN}${NC}"
echo -e "  🔑  Admin      : admin@meldex.ai / Admin1234!  ← CHANGE THIS"
echo -e "  📦  App dir    : ${APP_DIR}"
echo -e "  📋  PM2 logs   : pm2 logs meldex-ai"
echo -e "  🐘  DB URL     : ${DATABASE_URL}"
echo -e "  🔐  .env file  : ${APP_DIR}/.env.production (chmod 600)"
echo ""
warn "IMPORTANT: Change admin password at https://${DOMAIN}/settings/security"
warn "IMPORTANT: Fill in OPENROUTER_API_KEY and R2 credentials in .env.production if not set"
echo ""
