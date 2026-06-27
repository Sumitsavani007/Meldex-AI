# Meldex IDE Branding Cleanup Report

Date: 2026-06-27

## Changes

- Meldex shell uses `Meldex IDE`.
- Workspace container product metadata patch remains active.
- Workspace settings force window title to `Meldex IDE`.
- Setup/onboarding copy is Meldex-branded.
- Proxy log copy uses `Meldex IDE proxy`.

## Guardrail

The underlying runtime remains OpenVSCode Server, but user-facing Meldex shell and product metadata are patched to Meldex branding.

## Live QA

- Meldex shell contains `Meldex IDE` / `Meldex AI`.
- Meldex shell has no `VS Code`, `Visual Studio Code`, `OpenVSCode`, `Code OSS`, or `Get Started with VS Code` text.
- Running container product metadata:
  - `nameShort`: `Meldex IDE`
  - `nameLong`: `Meldex IDE`
  - `applicationName`: `meldex-ide`
- Remaining `Workbench` strings observed in proxied HTML are internal comments/performance marks, not visible UI copy.

## Status

READY
