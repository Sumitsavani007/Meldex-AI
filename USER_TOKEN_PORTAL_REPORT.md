# USER TOKEN PORTAL REPORT

Run timestamp: 2026-06-26

## Implemented

- Normal user token API:
  - `POST /api/account/tokens`
  - `GET /api/account/tokens`
  - `DELETE /api/account/tokens/[id]`
- Existing compatibility endpoints forward to the account token API:
  - `POST /api/extensions/tokens/create`
  - `GET /api/extensions/tokens`
  - `DELETE /api/extensions/tokens/[id]`
- `/settings/tokens` was rebuilt for normal users.

## Portal Features

- Create token.
- Name token.
- Select expiry: 30 days, 90 days, 1 year.
- Select scopes:
  - chat
  - agent
  - model-health
  - benchmark
- Copy raw token once immediately after creation.
- Raw token disappears after refresh.
- Active token list.
- Masked token display.
- Scopes display.
- Created/expiry/last-used dates.
- Status display: active, expired, revoked.
- Revoke/delete token.

## Admin/Master Support

Added admin APIs:

- `GET /api/admin/extension-tokens`
- `DELETE /api/admin/extension-tokens/[id]`

Admins can see masked token metadata and revoke tokens, but never see raw token values.

## Compatibility

Token format remains:

```text
mdx_...
```

Existing extension APIs continue to use Bearer auth.
