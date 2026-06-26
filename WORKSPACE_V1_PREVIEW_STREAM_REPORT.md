# Workspace V1 Preview Stream Report

## Implemented

- Preview lifecycle events:
  - `server_starting`
  - `server_ready`
  - `preview_verified`
- Preview iframe refreshes after file changes and final verification.
- File-change refreshes are debounced in the UI to avoid excessive reloads.
- Static preview verification still checks:
  - `index.html`
  - HTML shape
  - linked local assets

## Server Card States

Current static preview stream maps to:

- idle
- starting
- ready
- verified
- failed

Long-running managed Next/Vite server persistence remains future work. The Part 2 implementation keeps the UI contract and event model ready for server-runner integration.

