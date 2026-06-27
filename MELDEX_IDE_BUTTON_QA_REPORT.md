# Meldex IDE Button QA Report

Date: 2026-06-27

## Working

- Header toggles: Explorer, Preview, AI, Terminal, Output, Problems, Logs, Git, Search, Reset layout, and Workspaces.
- Code / Preview / Split mode buttons.
- Terminal, Output, Problems, and Logs open and close by clicking the same header control again.
- Preview refresh, open, copy URL, device selector, zoom, rotate, fullscreen.
- Explorer 3-dot actions: New File, New Folder, Save Current File, Save All, Rename Selected, Delete Selected, Duplicate Selected, Copy Path, Download Selected File, Download Project ZIP, Refresh Explorer, Reveal Active File, Collapse All, Expand All, Show/Hide Hidden Files, Sort by Name, Sort by Type, Show Changed Files Only, Export Task History, Clear Workspace Cache notice, and Command Palette.
- Editor save and autosave.
- AI send, stop, retry, continue.
- Activity filter and copy.
- Memory clear.
- Command palette actions.

## Disabled With Reason

- Preview back/forward: preview history is not available.
- Upload File: disabled with release note.
- Project Settings: disabled with release note.
- Selection-dependent Explorer actions: disabled until a file is selected.
- Save Current File: disabled until a dirty file is open.
- Attach context and voice input: not available in this release.
- Apply/reject/rollback: require selected diff/task snapshot.
- Outline/timeline: require symbol indexing/history.

## Verification

- `npm run lint`: passed with existing warnings only.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: passed with no pending local migrations.
- `npm run build`: passed.
- Live AWS deployment commit: `8346465f2b2fea7dc251d45053bbc79498422992`.
- Live authenticated IDE route source includes header module labels and right panel tabs.
- Live default workspace file API hides internal files.
- Live ZIP export excludes hidden/internal files.

## Remaining

- Drag/drop and multi-select are not exposed as visible fake controls.
- Browser pixel inspection should still be manually confirmed in Chrome because this environment verified source/API behavior rather than visual screenshots.
