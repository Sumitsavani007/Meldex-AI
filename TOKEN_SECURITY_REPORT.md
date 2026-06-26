# TOKEN SECURITY REPORT

Run timestamp: 2026-06-26

## Implemented

- Extension tokens are stored server-side as SHA-256 hashes.
- Raw `mdx_` tokens are returned only once at creation or once through the short-lived device-code approval handoff.
- Token metadata added:
  - `tokenPrefix`
  - `tokenLast4`
  - `scopesJson`
  - `expiresAt`
  - `lastUsedAt`
  - `revokedAt`
  - `updatedAt`
- Token display uses masking such as `mdx_****last4`.
- Token verifier uses a timing-safe comparison after hash lookup.
- Token verifier rejects:
  - invalid format
  - invalid token
  - expired token
  - revoked token
  - insufficient scope
- Token create and device connect APIs use in-process rate limiting.
- Token create/revoke actions write audit events.
- Extension APIs use Bearer token only.
- Extension child CLI receives token through `MELDEX_TOKEN`, not command arguments.

## Notes

- CSRF posture is inherited from authenticated NextAuth web-session routes. The token management APIs require the normal web session.
- The device-code table temporarily stores a raw token until the extension polls and consumes it, then clears it. This is intentionally short-lived and separate from the token table, which stores only hashes.
- HTTPS is required for production use through `https://meldex.newsyfly.com`.

## Not Completed

- Production migration was not applied because `npx prisma migrate deploy` was killed while Prisma attempted to connect to the local PostgreSQL datasource.
