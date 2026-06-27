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

## Remaining Issues

- Live deployment and live zero-leak search pending at report creation time.
