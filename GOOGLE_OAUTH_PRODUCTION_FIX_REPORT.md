# GOOGLE OAUTH PRODUCTION FIX REPORT

## Final Status: GOOGLE OAUTH PRODUCTION READY ✓

---

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| DNS | ✅ PASS | `meldex.newsyfly.com` → `16.171.165.221` |
| HTTP redirect | ✅ PASS | HTTP 301 → HTTPS |
| SSL/HTTPS | ✅ PASS | Let's Encrypt cert, valid until 2026-09-23 |
| Nginx | ✅ PASS | Proxies to `localhost:3000` with correct headers |
| `NEXTAUTH_URL` | ✅ PASS | `https://meldex.newsyfly.com` |
| Google provider | ✅ PASS | Registered in `/api/auth/providers` |
| Callback URL | ✅ PASS | `https://meldex.newsyfly.com/api/auth/callback/google` |
| vault-loader | ✅ PASS | Loaded 2 settings (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) |
| HSTS | ✅ PASS | `max-age=31536000; includeSubDomains; preload` |

---

## Root Cause

Two bugs combined to break Google OAuth:

### 1. No SSL certificate (PRIMARY)
The server had no HTTPS configured. Google OAuth requires `https://` redirect URIs for
all non-localhost domains. The server was only reachable via `http://16.171.165.221`
(IP + HTTP) which Google rejects with `Error 400: invalid_request`.

### 2. PM2 stuck with old `NEXTAUTH_URL=http://16.171.165.221`
PM2's `restart --update-env` does NOT re-read `env_file` — it only re-reads the `env`
section of `ecosystem.config.js`. The `.env.production` had the correct domain URL but
the running process was using the old IP. Required `pm2 delete` + `pm2 start` (full
process re-creation) to force fresh env loading.

---

## Changes Made

### Server-side (via SSH)

| Action | Command |
|--------|---------|
| Updated Nginx `server_name` | `sed -i "s/server_name _;/server_name meldex.newsyfly.com;/"` |
| Installed SSL certificate | `certbot --nginx -d meldex.newsyfly.com --non-interactive --agree-tos` |
| Forced PM2 fresh start | `pm2 delete meldex-ai && pm2 start ecosystem.config.js` |

### Already in place (from previous session)
- `NEXTAUTH_URL=https://meldex.newsyfly.com` in `.env.production`
- `AUTH_URL=https://meldex.newsyfly.com` in `.env.production`  
- `instrumentation.ts` → `vault-loader.ts` loads Google credentials at startup
- `lib/auth.ts` conditional Google provider registration
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` saved in encrypted vault

---

## Current Nginx Configuration Summary

```
# Port 443 (HTTPS) — active
server {
    server_name meldex.newsyfly.com;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/meldex.newsyfly.com/fullchain.pem;
    proxy_pass → http://127.0.0.1:3000;
    X-Forwarded-Proto $scheme;   # sends "https" to Next.js
}

# Port 80 (HTTP) — redirects to HTTPS
server {
    listen 80 default_server;
    return 301 https://$host$request_uri;
}
```

SSL cert auto-renews via systemd timer (certbot renew).

---

## /api/auth/providers Result

```json
{
  "credentials": {
    "id": "credentials",
    "name": "Email & Password",
    "type": "credentials",
    "signinUrl": "https://meldex.newsyfly.com/api/auth/signin/credentials",
    "callbackUrl": "https://meldex.newsyfly.com/api/auth/callback/credentials"
  },
  "google": {
    "id": "google",
    "name": "Google",
    "type": "oidc",
    "signinUrl": "https://meldex.newsyfly.com/api/auth/signin/google",
    "callbackUrl": "https://meldex.newsyfly.com/api/auth/callback/google"
  }
}
```

---

## Remaining Manual Step — Google Cloud Console

This ONE step must be done manually in the Google Cloud Console:

### Go to:
https://console.cloud.google.com/apis/credentials

### Select your OAuth 2.0 Client → Edit

### Add to **Authorized JavaScript origins**:
```
https://meldex.newsyfly.com
```

### Add to **Authorized redirect URIs**:
```
https://meldex.newsyfly.com/api/auth/callback/google
```

### Save and wait ~5 minutes for propagation.

> Without this step, Google will still reject login with `Error 400: redirect_uri_mismatch`.

---

## Vault Credential Loading

At every PM2 start, `instrumentation.ts` runs `vault-loader.loadVaultIntoEnv()`:

```
[vault-loader] ✓ Loaded 2 settings from vault into process.env
```

This injects `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the encrypted DB into
`process.env` BEFORE `auth.ts` initializes, so `GoogleProvider` is always registered
when credentials exist in either env or vault.

---

## Important: PM2 Restart Behavior

**`pm2 restart --update-env` does NOT re-read `env_file`.**

If you update `.env.production`, always use:
```bash
pm2 stop meldex-ai
pm2 delete meldex-ai
pm2 start ecosystem.config.js
pm2 save
```

Or use the Master Admin "Restart App" button (which calls `pm2 restart meldex-ai --update-env`
— this is fine for vault changes since vault-loader runs fresh each start regardless).
