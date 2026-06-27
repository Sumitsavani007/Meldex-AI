# Meldex IDE V2 Live QA Report

Date: 2026-06-27

## Local Status

- Native shell route implemented and builds.
- File extraction fallback implemented for nested model JSON and zero-file static generation.

## Deployment

- GitHub commit deployed: `d8d0016975867c7952d7d82faa4374d51b0be0b5`.
- AWS path: `/home/ubuntu/meldex-ai`.
- `npm install`: completed with existing package audit warnings.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed, no pending migrations.
- `npm run build`: passed with existing lint warnings only.
- `pm2 restart meldex-ai --update-env`: passed.
- `nginx -t` and reload: passed.

## Deployment Note

Initial AWS migration failed because `prisma.config.ts` does not auto-load `.env.local` and fell back to a local default database user. The production deploy was rerun with `DATABASE_URL` exported from `.env.local`; no schema reset or data deletion was performed.

## Live QA Checklist

- Authenticated `/workspace/[projectId]/ide` renders Meldex native shell: passed.
- Forbidden upstream branding absent from user-facing HTML/source: passed.
- Existing workspace loads real files: passed by API/source verification.
- New workspace opens native shell and shows Meldex onboarding once: implemented; source/API verified.
- Meldex AI stream endpoint produces orchestration events: passed.
- Preview endpoint returns generated static preview: passed.
- CSS asset endpoint `?file=style.css`: HTTP 200, `text/css`.
- JS asset endpoint `?file=script.js`: HTTP 200, `application/javascript`.
- PM2 and Nginx healthy after deploy: passed.

## Live Agent Smoke Test

- Prompt: `Create a compact premium hero section for Meldex.`
- Stream events: `39`.
- Event types included memory, intent, classifier, planner, architect, tool plan, confidence, Qwen generation, extraction, file updates, diffs, preview, finalizer, memory, learning, and done.
- File actions: `index.html`, `README.md`, `script.js`, `style.css`.
- Final status: `SUCCEEDED`.
- Quality score: `96`.
- Preview verified: yes.
- Preview HTTP status: `200`.
- Preview body: valid HTML, not JSON.
- Unresolved `${...}` placeholder check: no unresolved generated placeholders; one valid JavaScript template literal remains inside inline script.

## Remaining Issues

- Browser screenshot tooling is unavailable in this environment, so final visual QA should still be confirmed by opening the live page manually.
- Drag/drop and multi-select are not implemented; no fake visible controls are exposed for them.
