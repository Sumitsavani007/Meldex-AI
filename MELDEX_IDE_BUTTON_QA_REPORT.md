# Meldex IDE Button QA Report

Date: 2026-06-27

## Working

- Code / Preview / Split mode buttons.
- Terminal open button.
- Preview refresh, open, copy URL, device selector, zoom, rotate, fullscreen.
- Explorer actions, create file/folder, rename, duplicate, delete, download, copy path.
- Editor save and autosave.
- AI send, stop, retry, continue.
- Activity refresh through workspace reload.
- Memory clear.
- Command palette actions.

## Disabled With Reason

- Preview back/forward: preview history is not available.
- Attach context and voice input: not available in this release.
- Apply/reject/rollback: require selected diff/task snapshot.
- Outline/timeline: require symbol indexing/history.

## Verification

- `npm run lint`: passed with existing warnings only.
- `npm run build`: passed.

## Remaining

- Drag/drop and multi-select are not exposed as visible fake controls.
