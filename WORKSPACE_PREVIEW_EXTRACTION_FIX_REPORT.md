# Workspace Preview Extraction Fix Report

Date: 2026-06-27

## Issue

Workspace preview could render unsafe model output instead of generated website files:

- Raw JSON/model plan text
- Escaped `\n` content
- Unresolved `${...}` placeholders
- Missing `style.css` / `script.js`
- HTML not linking the generated assets

## Fix

Updated the workspace backend pipeline only.

Changed files:

- `lib/ai-workspace.ts`
- `app/api/workspaces/[id]/agent/route.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`

Implemented:

- Coerces JSON model responses into safe `WorkspaceFileAction` records.
- Extracts markdown code blocks for HTML/CSS/JS fallback responses.
- Decodes escaped generated content before saving files.
- Rejects raw model dumps and unresolved template placeholders.
- Ensures static website prompts produce `index.html`, `style.css`, `script.js`.
- Normalizes `index.html` links to `./style.css` and `./script.js`.
- Adds a deterministic premium pricing fallback when model output is not render-safe.
- Applies the same fix to standard and streaming workspace agent routes.
- Stops marking a task as succeeded unless preview render validation passes.

## Verification

- `npm run lint`: passed with existing warnings.
- `npx prisma generate`: passed.
- `npm run build`: passed.

