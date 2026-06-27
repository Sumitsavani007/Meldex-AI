# Rate Limit Report

Date: 2026-06-27

## Implemented

- Added `RateLimitRule` table with DB-controlled rules.
- Seeded rules for chat, agent runs, workspace actions, preview, downloads, and API access.
- Chat API checks dynamic DB rate limits before model calls.
- Workspace agent and stream APIs check dynamic DB rate limits before model calls.
- User API-key creation checks API access rate limits.

## Behavior

- Blocked requests return `RATE_LIMIT_EXCEEDED` with retry metadata.
- Rate-limit violations create abuse events for auditability.

## Verification

- Local migration created 6 default rate-limit rules.
- Build passed.
