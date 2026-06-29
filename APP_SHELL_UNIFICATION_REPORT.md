# App Shell Unification Report

Date: 2026-06-30

## What Was Broken

- Dashboard used a separate custom sidebar.
- Protected pages had mixed logout and sidebar behavior.
- Public header did not explicitly hide authenticated controls while session state was loading or logged out.

## What Changed

- Dashboard now uses the shared `UserPanelSidebar`.
- Shared sidebar remains collapsed by default, expands on hover, and persists the pinned collapsed setting.
- Public `Header` no longer renders on `/studio` to avoid duplicate Studio top navigation.
- Protected route coverage was expanded in middleware.

## Verification

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Local route smoke checks passed for public and protected pages.

## Remaining Notes

- Chat keeps its conversation-history rail in addition to the global app sidebar because it is chat-specific content, not global navigation.
