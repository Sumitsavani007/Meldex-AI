# IDE Proxy Security Report

Date: 2026-06-27

## Auth Model

The public IDE entrypoint remains Meldex-owned:

1. User opens `/workspace/[projectId]/ide`.
2. Meldex verifies login.
3. Meldex verifies workspace ownership.
4. Meldex starts or reuses an OpenVSCode container bound to localhost only.
5. Meldex issues a short-lived IDE session token.
6. The proxy accepts `/ide/<workspaceId>/?tkn=...` only when the token matches the active session.

## Proxy Hardening

- OpenVSCode containers bind to `127.0.0.1` only.
- Nginx exposes only `/ide/` through `127.0.0.1:3101`.
- Invalid token returns `401`.
- Unauthenticated `/workspace/[projectId]/ide` redirects to login.
- The proxy sets an HttpOnly, Secure, path-scoped cookie after a valid token request.
- The proxy strips `tkn` before forwarding to OpenVSCode.
- WebSocket upgrade headers are configured in Nginx and proxied by `scripts/openvscode-proxy.js`.
- OpenVSCode Content-Security-Policy is hidden at proxy level to allow iframe embedding inside same-origin Meldex.
- Nginx adds `X-Frame-Options: SAMEORIGIN`.

## Live Security QA

- Bad token check: `401 Invalid IDE session`
- Unauthenticated protected route: `302` to `/login?callbackUrl=...`
- Authenticated protected route: `200`
- Authenticated proxied workbench route: `200`

## Open Risk

OpenVSCode itself is running without its own connection-token because the official Docker image defaults that way. This is acceptable for this deployment because the container is localhost-only and Meldex proxy/session auth is the public security boundary.

## Status

READY
