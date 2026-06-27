# Meldex IDE Branding Report

Date: 2026-06-27

## Changes

- IDE shell now says `Meldex IDE`.
- Loading shell says `Opening Meldex IDE…`.
- User-facing extension wording now says `Meldex extension` / `Meldex`.
- Workspace container writes `.vscode/settings.json` with:
  - `workbench.startupEditor: none`
  - `window.title: Meldex IDE - ...`
  - telemetry disabled
- OpenVSCode container product metadata is patched best-effort to:
  - `Meldex IDE`
  - `meldex-ide`
  - `.meldex-ide`

## Branding Scan

No user-facing `VS Code`, `Visual Studio Code`, `Code - OSS`, or setup-copy strings remain in app UI copy. Internal helper names still include `openvscode` because they identify the underlying service implementation.

## Status

READY
