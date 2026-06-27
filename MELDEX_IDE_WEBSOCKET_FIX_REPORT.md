# Meldex IDE WebSocket Fix Report

Date: 2026-06-27

## Current Proxy State

- Nginx `/ide/` route proxies to `127.0.0.1:3101`.
- WebSocket headers are configured:
  - `Upgrade`
  - `Connection`
  - `Host`
  - `X-Forwarded-For`
  - `X-Forwarded-Proto`
- Node proxy supports HTTP and WebSocket upgrade.
- OpenVSCode runs with `--server-base-path /ide/<workspaceId>`.
- Proxy validates short-lived session token or scoped HttpOnly cookie.

## Additional Fixes

- Proxy log name is now `Meldex IDE proxy`.
- IDE shell shows a Meldex reconnect card with Retry and Back to list if session startup fails.

## Status

READY
