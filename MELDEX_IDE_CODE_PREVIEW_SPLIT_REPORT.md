# Meldex IDE Code Preview Split Report

Date: 2026-06-27

## Fixed

- Added top center modes: `Code`, `Preview`, and `Split`.
- Code mode shows only editor/tabs.
- Preview mode shows full preview canvas and toolbar.
- Split mode shows editor and preview side by side with a resizable divider.
- Per-workspace view state persists:
  mode, split ratio, active file, preview device, preview mode, and zoom.
- Preview toolbar now includes HTTP status, refresh, open, copy, device selector, responsive size selector, zoom, rotate for tablet/mobile, and fullscreen.

## Verification

- Local build and lint passed.
- Type validation passed through Next build.

## Remaining

- Browser screenshot tooling was unavailable in this environment, so final visual pixel QA should be confirmed manually on the live page.
