# Meldex AI — Deployment Checklist

Work through every item below before going live.  Check each box as you complete it.

---

## 1. Database

- [ ] PostgreSQL 15+ instance provisioned (Supabase / Neon / Railway / self-hosted)
- [ ] `DATABASE_URL` set in `.env.local`  
      Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`
- [ ] Prisma client generated: `npm run db:generate`
- [ ] Schema migrated to the live database: `npm run db:migrate:prod`  
      (or `npx prisma migrate deploy`)
- [ ] Seed script executed to create the first admin: `npm run db:seed`  
      Or use the interactive script: `npm run admin:create`
- [ ] Verify admin login works at `/login`
- [ ] Confirm `npx prisma studio` can connect and shows tables

---

## 2. Authentication

- [ ] `NEXTAUTH_SECRET` set — generate with: `openssl rand -base64 32`
- [ ] `NEXTAUTH_URL` set to the full public URL (no trailing slash)  
      e.g. `https://meldex.yourdomain.com`
- [ ] Credentials (email/password) login tested ✓
- [ ] Password hashing verified (bcrypt cost 12 in production seed)

---

## 3. OAuth Providers

### Google
- [ ] OAuth 2.0 App created at https://console.cloud.google.com/
- [ ] Authorized redirect URI added:  
      `{NEXTAUTH_URL}/api/auth/callback/google`
- [ ] `GOOGLE_CLIENT_ID` set
- [ ] `GOOGLE_CLIENT_SECRET` set
- [ ] Google login tested end-to-end ✓

### GitHub
- [ ] OAuth App created at https://github.com/settings/developers
- [ ] Callback URL set: `{NEXTAUTH_URL}/api/auth/callback/github`
- [ ] `GITHUB_ID` set
- [ ] `GITHUB_SECRET` set
- [ ] GitHub login tested end-to-end ✓

---

## 4. Ollama / AI

- [ ] Ollama installed and running: `ollama serve`
- [ ] Default model pulled: `ollama pull qwen3-coder:30b`  
      (or set `DEFAULT_MODEL` to a smaller model for low-VRAM machines)
- [ ] `OLLAMA_BASE_URL` set (default: `http://localhost:11434`)
- [ ] `DEFAULT_MODEL` set
- [ ] `/api/health` → `checks.ollama.status` is `"ok"` ✓
- [ ] Chat page sends a test message successfully ✓

---

## 5. Build

- [ ] `.env.local` created and all required vars set  
      (copy from `.env.example` as a template)
- [ ] `npm install` completes without errors
- [ ] `npx prisma generate` completes without errors
- [ ] `npm run build` passes with zero TypeScript errors ✓
- [ ] No critical npm audit vulnerabilities: `npm audit`

---

## 6. Security

- [ ] `NEXTAUTH_SECRET` is a random 32+ byte secret (not the example placeholder)
- [ ] Database password is strong and not shared with other services
- [ ] Admin account password changed from the seed default
- [ ] `.env.local` is in `.gitignore` (never committed)
- [ ] HTTPS / TLS configured on the reverse proxy or PaaS
- [ ] Security headers set (HSTS, CSP, X-Frame-Options) — use a reverse proxy or
      add `headers()` to `next.config.ts`
- [ ] Rate limiting reviewed for production traffic levels
- [ ] Run `npm audit` — resolve any critical/high advisories

---

## 7. Deployment Method

### Option A — Docker Compose (self-hosted)
- [ ] Docker and Docker Compose installed on the server
- [ ] `.env.local` copied to the server
- [ ] `docker compose up -d` starts all services
- [ ] `docker compose ps` shows all containers `healthy` or `Up`
- [ ] `/api/health` returns `{"status":"ok"}` from outside the container ✓

### Option B — Vercel / PaaS
- [ ] Repository pushed to GitHub / GitLab
- [ ] Project imported in Vercel dashboard
- [ ] All env vars set in Vercel → Settings → Environment Variables
- [ ] `NEXTAUTH_URL` set to the Vercel deployment URL
- [ ] Preview deployment tested before promoting to production

### Option C — Manual VPS
- [ ] Node.js 22+ installed
- [ ] `npm ci --omit=dev` to install production deps
- [ ] `npx prisma generate && npx prisma migrate deploy`
- [ ] `npm run build`
- [ ] Process manager configured (PM2, systemd, etc.)
- [ ] Reverse proxy (nginx / Caddy) configured with HTTPS

---

## 8. Post-Deployment Verification

- [ ] Home page loads: `{NEXTAUTH_URL}/`
- [ ] Login works: `{NEXTAUTH_URL}/login`
- [ ] Register works: `{NEXTAUTH_URL}/register`
- [ ] Admin panel accessible (OWNER role): `{NEXTAUTH_URL}/admin`
- [ ] Health endpoint returns `ok`: `{NEXTAUTH_URL}/api/health`
- [ ] System diagnostics page shows all green: `{NEXTAUTH_URL}/admin/system`
- [ ] Chat sends a message and receives a response
- [ ] Workspace creates and reads files correctly
- [ ] Audit log captures the first login event

---

## 9. Monitoring & Observability (Recommended)

- [ ] Error tracking set up (Sentry, BugSnag, etc.)
- [ ] Uptime monitor pointing at `/api/health`
- [ ] Database backup schedule configured
- [ ] Log aggregation set up (Logtail, Datadog, CloudWatch, etc.)

---

## 10. Remaining Feature Work

The following items are functional but not complete for a fully polished SaaS:

- [ ] Email verification flow (currently auto-verified on register)
- [ ] Password reset / forgot-password flow
- [ ] Stripe webhook integration for billing lifecycle
- [ ] Admin UI actions: ban user, change role (API stubs exist, UI buttons are wired)
- [ ] Usage analytics page wired to real `UsageLog` data
- [ ] Distributed rate limiting (Redis) for multi-instance deployments

---

*Checklist last updated: 2026-06-24*
