# Workspace Event Bus Report

Date: 2026-06-28

## What Was Broken

- The workspace stream route emitted events inline from the route handler.
- Long model calls could leave the UI stuck on a generic thinking state.
- Client disconnects could mark work as canceled before the backend finished applying generated files.

## What Changed

- Added `lib/workspace-event-bus.ts`.
- Centralized:
  - `emitWorkspaceEvent`
  - `flushWorkspaceEvent`
  - `persistWorkspaceEvent`
- Events are serialized through a queue so sequence order remains stable.
- Every event is persisted when a task exists.
- SSE flushes immediately when the browser connection is open.
- If the browser disconnects, flushing is skipped safely while event persistence can continue.
- Added heartbeat events during long model calls.

## Files Changed

- `lib/workspace-event-bus.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`
- `app/workspace/workspace-client.tsx`

## Verification

- `npm run lint` passed with existing hook dependency warnings.
- `npx prisma generate` passed.
- `npm run build` passed.

## Notes

- Heartbeat interval is 3 seconds.
- Browser disconnect handling is best-effort inside the current HTTP route runtime; persisted events are available for frontend polling after reload.
