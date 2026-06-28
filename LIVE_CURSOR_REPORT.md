# Live Cursor Report

Date: 2026-06-28

## What Changed

- Added live cursor metadata to editor chunk events:
  - `cursorLine`
  - `cursorColumn`
  - `activeLine`
- Added client state to display line/column while Meldex AI types.
- The editor selection moves to the latest streamed cursor position.
- The editor scroll follows the current edit.

## Live QA

Cursor samples from production stream:

- `index.html` chunk `0`: line `13`
- `index.html` chunk `1`: line `25`
- `index.html` chunk `2`: line `43`
- `index.html` final chunk: line `91`
- `style.css`: streamed in `8` chunks.
- `script.js`: streamed in `1` chunk because file is short.

## Result

Cursor movement metadata is live and consumed by the Workspace editor.

