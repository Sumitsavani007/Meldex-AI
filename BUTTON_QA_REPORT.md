# Button QA Report

Status: completed

## Dashboard
- Create Workspace: working link to `/workspace`.
- Ask AI: working link to `/chat`.
- API Tokens: working link to `/settings/tokens`.
- Hero arrow action: working navigation to `/workspace`.
- View all workspaces: working link to `/workspace`.
- Recent workspace cards: working links to `/workspace/[id]`.
- Quick Actions: working links to Workspace, Chat, Tokens, and Billing.
- Theme toggle: working through existing theme provider.
- Logout in sidebar: working through NextAuth signout.

## Chat
- New chat: working.
- Rename, pin, duplicate, export, archive, delete conversation: existing working local actions retained.
- Collapsed sidebar shortcuts: converted from dead buttons to working links.
- File, image, and voice attachment controls: intentionally disabled with clear titles.
- Send and stop generation: existing working controls retained.

## Workspace
- Workspace topbar navigation: working unique links.
- Create workspace: existing API-backed action retained.
- Open workspace: working link.
- Duplicate workspace: disabled with reason for V1.
- Archive/delete workspace: existing API-backed actions retained.
- Refresh preview, open preview, copy URL, stop preview, review, reject/rollback: existing controls retained.

## Shared Header
- Removed duplicate route items that caused two active selections.
- Active state now maps to one label per route.

## Verification
- `npm run lint`: passed with existing warnings only.
- `npm run build`: passed.

## Remaining Non-Blocking Warnings
- `app/api/extensions/chat/route.ts`: existing unused `lastMessage` warning.
- `app/workspace/workspace-client.tsx`: existing hook dependency warning.
- `app/workspace/workspace-index-client.tsx`: existing hook dependency warning.
