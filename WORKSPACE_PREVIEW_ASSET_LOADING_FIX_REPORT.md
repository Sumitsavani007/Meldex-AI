# Workspace Preview Asset Loading Fix Report

Date: 2026-06-27

## Issue

Workspace preview rendered generated HTML, but CSS/JS and some images did not load in the iframe or when opened in a new tab. The visible symptom was browser-default typography and unstyled output even though `style.css` and `script.js` existed.

## Root Cause

Generated HTML links assets as `./style.css` and `./script.js`. The preview is served from:

`/api/workspaces/[id]/preview`

In the browser, relative links can resolve outside the preview file-serving API, so the HTML loads but assets are requested from the wrong route. The previous content security policy also blocked external HTTPS images.

## Fix

- Rewrote local HTML `href`, `src`, and `srcset` asset URLs to:

`/api/workspaces/[id]/preview?file=...`

- Rewrote local CSS `url(...)` asset references to the same file-serving API.
- Kept path traversal protection through the existing `resolveProjectFile()` flow.
- Allowed safe HTTPS images/fonts in preview CSP while keeping scripts local/self-controlled.
- Did not change Workspace UI, agent logic, Qwen logic, auth, or database models.

## Verification

- `npm run lint`: passed with existing warnings only.
- `npx prisma generate`: passed.
- `npm run build`: passed.

