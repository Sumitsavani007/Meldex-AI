# Workspace Preview Asset Loading Fix Report

Date: 2026-06-27

## Issue

Workspace preview rendered generated HTML, but CSS/JS and some images did not load in the iframe or when opened in a new tab. The visible symptom was browser-default typography and unstyled output even though `style.css` and `script.js` existed.

## Root Cause

Generated HTML links assets as `./style.css` and `./script.js`. The preview is served from:

`/api/workspaces/[id]/preview`

In the browser, relative links can resolve outside the preview file-serving API, so the HTML loads but assets are requested from the wrong route. The previous content security policy also blocked external HTTPS images.

Production also had nginx configured with `proxy_hide_header Content-Security-Policy` and an older hard-coded preview CSP, so the app-level CSP was being replaced before reaching the browser.

## Fix

- Rewrote local HTML `href`, `src`, and `srcset` asset URLs to:

`/api/workspaces/[id]/preview?file=...`

- Rewrote local CSS `url(...)` asset references to the same file-serving API.
- Kept path traversal protection through the existing `resolveProjectFile()` flow.
- Allowed safe HTTPS images/fonts in preview CSP while keeping scripts local/self-controlled.
- Updated production nginx preview CSP to allow HTTPS images/fonts and reloaded nginx.
- Did not change Workspace UI, agent logic, Qwen logic, auth, or database models.

## Verification

- `npm run lint`: passed with existing warnings only.
- `npx prisma generate`: passed.
- `npm run build`: passed.

## Live Verification

- AWS commit: `409b33649f0b71c6b2f3cf5fac2e7d50c612af45`
- PM2 app: `meldex-ai` online
- nginx config test: passed
- nginx reload: passed
- Preview status: 200
- Rewritten CSS URL: `/api/workspaces/[id]/preview?file=style.css`
- Rewritten JS URL: `/api/workspaces/[id]/preview?file=script.js`
- CSS response: 200, `text/css; charset=utf-8`
- JS response: 200, `application/javascript; charset=utf-8`
- CSP allows HTTPS images: yes
