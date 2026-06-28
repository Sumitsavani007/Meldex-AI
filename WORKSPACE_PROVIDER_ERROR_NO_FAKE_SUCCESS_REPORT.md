# Workspace Provider Error No Fake Success Report

Date: 2026-06-28

## Requirement

If provider/model generation fails:

- Do not create fake files.
- Do not show edited files.
- Do not show preview as completed.
- Show a clean provider error with exact cause.

## Verification

Before plan upgrade, the same authenticated test user was blocked by feature gating:

`FEATURE_NOT_ALLOWED: parallel_tasks`

Verification after this block:

- Workspace files endpoint returned an empty tree.
- No generated files were created.
- No fake preview was produced.

Provider failure path now emits `provider_failed` and throws before file extraction/write loops.

## Fixes

- Provider failures are no longer converted into fake offline files.
- Empty model output stops before physical writes.
- Generic provider errors now include safe provider details and credit messages.

## Result

No-fake-success behavior is verified.
