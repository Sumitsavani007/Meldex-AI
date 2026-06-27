# Meldex IDE V2 Button QA Report

Date: 2026-06-27

## Working Controls

- Workspace list button: navigates to `/workspace`.
- Explorer actions: opens command palette.
- Create file/folder: calls real workspace file APIs.
- Rename/delete/duplicate/download/copy path: wired through real file APIs or browser APIs.
- Save: writes via workspace file API.
- Run/Send: calls `/api/workspaces/[id]/agent/stream`.
- Stop: aborts running stream.
- Retry/Continue: reruns the active/previous prompt path.
- Refresh/restart preview: calls `/api/workspaces/[id]/run`.
- Preview open/copy/fullscreen/device/zoom: wired in shell.
- Bottom panel clear/copy/collapse: wired.
- Command palette commands: either working or disabled with reason.

## Disabled With Reason

- Preview back/forward: disabled because preview history is not available.
- Outline: disabled until symbol indexing is available.
- Timeline: disabled until file history is available.
- AI history/settings/more: disabled with release-specific reasons.
- Apply/reject/rollback: disabled until a selected diff/task snapshot exists.
- Attach/voice: disabled with clear reasons.

## Local Verification

- Build and lint passed.

## Remaining Issues

- Drag/drop and multi-select are not yet implemented in the native shell. They are not exposed as visible fake controls.
