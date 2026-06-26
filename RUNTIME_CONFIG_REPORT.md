# Runtime Config Report

Date: 2026-06-26

## Runtime Source Rules

Runtime-editable settings use:
`vault -> process.env -> default`

Boot-critical settings use:
`process.env -> vault/default only where safe`

## Verified Runtime Paths

- OpenRouter model/router path uses `runtime-config`.
- OpenRouter provider health uses `runtime-config`.
- Extension model health uses provider health and returns safe errors.
- R2 client uses `runtime-config`.
- Search providers use runtime settings.
- Master settings API lists ENV/VAULT/MISSING source badges.
- Reload config clears runtime cache and retests OpenRouter.

## Security Changes

- Secret writes require OWNER.
- ENV sync requires OWNER.
- App restart requires OWNER.
- Raw secret reveal remains disabled.

## Startup-Sensitive Settings

OAuth provider registration remains startup-sensitive:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_ID`
- `GITHUB_SECRET`

Vault can store these values, but app restart is required before Auth.js provider registration changes are active.

