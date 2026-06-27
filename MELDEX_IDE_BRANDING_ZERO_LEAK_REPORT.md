# Meldex IDE Branding Zero-Leak Report

Date: 2026-06-27

## What Was Broken

- Upstream IDE welcome/walkthrough strings could still render user-facing labels such as upstream product names, setup copy, and chat prompts.
- Product metadata was patched, but core localized workbench strings were not fully replaced.
- Existing workspace sessions could reuse old containers without the latest zero-leak patch.

## What Changed

- Bumped IDE container runtime label to `native-v4` so older containers are recreated.
- Added source-level runtime patching for product metadata and workbench localization files.
- Added workspace and IDE user settings to suppress welcome/walkthrough startup behavior.
- OpenVSCode startup now runs with `--skip-welcome` and `--disable-telemetry`.

## Files Changed

- `lib/openvscode-manager.ts`
- `app/workspace/[projectId]/ide/ide-frame-client.tsx`

## Verification

- Local lint passed with existing warnings only.
- Prisma generate passed.
- Prisma migrate deploy passed locally with no pending migrations.
- Production build passed locally.
- AWS deploy completed at commit `5d3bfeef9c5f3981a3ff91220cc5a930c8576bf2`.
- Live existing workspace container label: `native-v4`.
- Live product metadata: `nameShort`, `nameLong`, `applicationName`, and `serverApplicationName` use Meldex names.
- Live workbench localization scan found no forbidden strings in `product.json`, `nls.messages.js`, or `nls.messages.json`.
- Authenticated IDE shell route returned HTTP `200`.
- Unauthenticated `/ide/[workspaceId]/` returned HTTP `401`.

## Remaining Issues

- In-app screenshot capture was unavailable in this Codex session, so visual QA used live source/container inspection instead.
