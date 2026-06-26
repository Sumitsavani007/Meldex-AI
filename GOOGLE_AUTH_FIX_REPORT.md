# GOOGLE AUTH FIX REPORT

## Status: GOOGLE AUTH READY ✓

---

## Root Cause

Three bugs prevented Google OAuth from working after saving credentials via Master Admin vault:

### Bug 1 — Auth.ts reads `process.env` at module initialization (PRIMARY)

`lib/auth.ts` calls `GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID })` at the
**top level of the module**, evaluated once when the file is first imported by Node.js.
If `GOOGLE_CLIENT_ID` was not in `.env.production` but only in the encrypted vault DB,
it was `""` forever — the provider was registered with empty credentials and would fail
silently. No restart could fix it without a mechanism to pre-populate `process.env`.

### Bug 2 — No vault-to-env bridge at startup

The vault existed, the encryption key existed, but nothing loaded vault values into
`process.env` before `auth.ts` was initialized. Values saved via Master Admin vault
sat unused in the DB.

### Bug 3 — `NEXTAUTH_URL` set to IP instead of domain

The server had `NEXTAUTH_URL=http://16.171.165.221` (or unset). Google OAuth requires
the callback URL to match an Authorized Redirect URI in Google Console. The correct URL
is `https://meldex.newsyfly.com/api/auth/callback/google`.

### Bug 4 — Test/Overview endpoints only checked `process.env`

The Master Admin "Test Connection" for Google always showed `misconfigured` even after
vault save, because it only looked at `process.env`, not the vault DB.

---

## Files Changed

| File | Change |
|------|--------|
| `instrumentation.ts` | **NEW** — Next.js startup hook, calls `loadVaultIntoEnv()` |
| `lib/vault-loader.ts` | **NEW** — Loads all vault secrets into `process.env` at startup |
| `lib/auth.ts` | Conditional provider registration (only when credentials exist) |
| `app/api/admin/master/test/route.ts` | Google/GitHub test now checks vault when env missing |
| `app/api/admin/master/overview/route.ts` | Overview status checks vault for Google/GitHub |
| `app/admin/master/page.tsx` | Added `configured_needs_restart` status color/dot |
| `next.config.ts` | Added Google domains to CSP `connect-src` |
| Server `.env.production` | `NEXTAUTH_URL=https://meldex.newsyfly.com` + `AUTH_URL=https://meldex.newsyfly.com` |

---

## How the Fix Works

### Startup sequence (after fix):

```
1. PM2 starts Next.js server
2. instrumentation.ts → register() fires (before any routes initialize)
3. vault-loader.loadVaultIntoEnv() runs:
   - Connects to DB using DATABASE_URL (already in env)
   - Reads all SystemSetting rows
   - For secrets: decrypts valueEncrypted using SETTINGS_ENCRYPTION_KEY
   - For non-secrets: reads valueMasked (stores plaintext for non-secret fields)
   - Writes values into process.env (skips boot-critical keys, skips keys already in env)
   - Logs: "[vault-loader] ✓ Loaded N settings from vault into process.env"
4. auth.ts is imported (first request to an auth route)
   - process.env.GOOGLE_CLIENT_ID now has the vault value
   - GoogleProvider is registered with real credentials
5. /api/auth/providers returns { google: {...}, credentials: {...} }
```

### Conditional provider registration:

```typescript
// lib/auth.ts — providers array
...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? [GoogleProvider({ clientId: ..., clientSecret: ... })]
  : []),
```

If credentials are missing, Google simply doesn't appear in `/api/auth/providers`.
No silent failures with empty strings.

---

## Provider Loading Source

Priority order (vault-loader enforces this):
1. `process.env` — wins always (set in `.env.production`)
2. Encrypted vault (DB `SystemSetting`) — loaded at startup if env is missing
3. Not configured — provider not registered

After a vault save → app restart:
- vault-loader loads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `process.env`
- `auth.ts` sees both values and registers `GoogleProvider`
- `/api/auth/providers` includes Google
- Login page shows Google OAuth button

---

## /api/auth/providers Expected Result

When Google credentials are configured (env or vault + restart):
```json
{
  "credentials": {
    "id": "credentials",
    "name": "Email & Password",
    "type": "credentials"
  },
  "google": {
    "id": "google",
    "name": "Google",
    "type": "oauth",
    "signinUrl": "https://meldex.newsyfly.com/api/auth/signin/google",
    "callbackUrl": "https://meldex.newsyfly.com/api/auth/callback/google"
  }
}
```

---

## Master Admin Status (after fix)

| Check | Before | After |
|-------|--------|-------|
| `googleOauth` | `not_configured` | `configured` (if vault loaded on startup) |
| Test → Google | `misconfigured: GOOGLE_CLIENT_ID not set` | `configured: Google OAuth configured and active` |
| Test callback URL | wrong (IP-based) | `https://meldex.newsyfly.com/api/auth/callback/google` |
| Overview status | `not_configured` | `configured` or `configured_needs_restart` (if vault-only) |

---

## Google Console Required Configuration

### Authorized JavaScript Origins:
```
https://meldex.newsyfly.com
```

### Authorized Redirect URIs:
```
https://meldex.newsyfly.com/api/auth/callback/google
```

> **Important**: These must be added in Google Cloud Console → APIs & Services →
> Credentials → OAuth 2.0 Client IDs → Edit. Changes take ~5 minutes to propagate.

---

## Remaining Manual Steps

### 1. Add Google Console redirect URI (REQUIRED)
Go to: https://console.cloud.google.com/apis/credentials
- Select your OAuth 2.0 client
- Add to **Authorized JavaScript origins**: `https://meldex.newsyfly.com`
- Add to **Authorized redirect URIs**: `https://meldex.newsyfly.com/api/auth/callback/google`
- Save and wait ~5 minutes

### 2. Confirm credentials in vault
In Master Admin → Credentials Vault → OAuth Providers:
- `GOOGLE_CLIENT_ID` → should show `VAULT` or `ENV` badge (not `MISSING`)
- `GOOGLE_CLIENT_SECRET` → should show `VAULT` or `ENV` badge

### 3. Verify Cloudflare/Nginx passes HTTPS
The domain `meldex.newsyfly.com` must proxy to `http://16.171.165.221:80` (via Cloudflare
proxy or Nginx with SSL). Google OAuth requires `https://` for the redirect URI.

### 4. Test via Master Admin
Go to: https://meldex.newsyfly.com/admin/master → Integrations tab → Test Google
Should show: `configured: Google OAuth configured and active`

### 5. Test login
Go to: https://meldex.newsyfly.com/login
Google sign-in button should appear.

---

## Env Key Naming Reference

| Provider | Env Key | Notes |
|----------|---------|-------|
| Google Client ID | `GOOGLE_CLIENT_ID` | Correct — used in auth.ts |
| Google Secret | `GOOGLE_CLIENT_SECRET` | Correct — used in auth.ts |
| GitHub Client ID | `GITHUB_ID` | Correct — used in auth.ts |
| GitHub Secret | `GITHUB_SECRET` | Correct — used in auth.ts |
| App URL | `NEXTAUTH_URL` | Set to `https://meldex.newsyfly.com` ✓ |
| Auth URL (v5) | `AUTH_URL` | Set to `https://meldex.newsyfly.com` ✓ |

---

## Deployment Info

- Committed: `926574d`
- Deployed: 2026-06-25
- Server: `ubuntu@16.171.165.221`
- PM2 status: `online` (fork mode, pid 6210)
- NEXTAUTH_URL: `https://meldex.newsyfly.com` ✓
- Build: 50 routes, warnings only (no errors) ✓
