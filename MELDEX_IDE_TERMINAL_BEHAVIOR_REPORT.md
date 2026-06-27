# Meldex IDE Terminal Behavior Report

Date: 2026-06-27

## Fixed

- Bottom terminal is closed by default.
- Header `Terminal` button opens the bottom panel.
- Bottom panel close/collapse state persists.
- Agent progress continues to log quietly without forcing the terminal open.
- Errors open `Problems` automatically so failures are visible.

## Verification

- Local build passed.
- Button states are wired in the native shell.

## Remaining

- Real interactive PTY terminal is not exposed here; the current panel remains managed output/problems/logs.
