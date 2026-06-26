# Workspace V1 Performance Report

## Local Result

Workspace V1 passed local production build and functional smoke tests.

## Streaming

- SSE streaming endpoint completed successfully.
- 13 stream events were emitted.
- 13 events were persisted.
- UI appends stream events without reloading the page.

## File Tree

- File tree is memoized through flattened file list calculation.
- Tree rendering is scoped to workspace state.
- Large file content is capped at API validation boundaries for create/update.

## Logs

- Logs panel is scrollable and hidden until expanded.
- Mobile logs are separated into a tab to avoid crowding the main workspace view.

## Preview

- Preview refresh is manual and does not poll continuously.
- Preview verification records are persisted.
- Stop preview button now calls the existing preview stop action.

## Build Metrics

- `npm run build`: passed.
- Workspace page first load JS:
  - `/workspace`: 4.24 kB page size, 114 kB first load JS.
  - `/workspace/[projectId]`: 7.6 kB page size, 117 kB first load JS.

## Known Non-Critical Warnings

- `app/api/extensions/chat/route.ts`: unused `lastMessage`.
- Workspace client hook dependency warnings.

These are not critical launch blockers but should be cleaned before a larger benchmark or V1.1 polish pass.
