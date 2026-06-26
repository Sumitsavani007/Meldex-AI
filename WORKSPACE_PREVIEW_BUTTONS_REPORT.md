# Workspace Preview Buttons Report

Date: 2026-06-27

## Button Status

- Refresh preview: working, calls `/api/workspaces/[id]/run`.
- Open preview: working when preview exists, disabled when no preview is available.
- Copy URL: working when preview exists, disabled when no preview is available.
- Stop preview: working when preview exists, disabled when preview is unavailable or already stopped.
- View logs: working, switches Workspace to the Logs tab and opens logs panel.
- Start preview empty state: working when a workspace exists.

## Preview States

- Not started
- Starting
- Running
- Verifying
- Verified
- Failed
- Stopped

## Security Fix

The live preview iframe was blocked by the global `X-Frame-Options: DENY` header. The exception is now scoped to workspace preview routes only:

- Application route: `/api/workspaces/:id/preview`
- Nginx route: `^/api/workspaces/[^/]+/preview`

All other pages retain DENY framing protection.
