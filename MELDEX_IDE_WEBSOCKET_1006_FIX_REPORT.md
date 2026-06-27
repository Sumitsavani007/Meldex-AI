# Meldex IDE WebSocket 1006 Fix Report

Date: 2026-06-27

## Root Cause

The Meldex IDE proxy accepted browser websocket upgrades, but the proxy wrote a simplified `101 Switching Protocols` response back to the browser instead of forwarding the upstream OpenVSCode websocket response headers.

That dropped required headers such as `Sec-WebSocket-Accept`, which can cause the workbench to close with status code `1006`.

## Fix

- Updated `scripts/openvscode-proxy.js`.
- The upgrade handler now forwards the upstream status line and raw websocket headers.
- Existing session-token validation remains in place.
- Existing `/ide/<workspaceId>` base-path routing remains in place.
- Bad IDE sessions still return `401`.

## AWS/Nginx Requirements

Nginx `/ide/` must retain:

- `Upgrade`
- `Connection`
- `Host`
- `X-Real-IP`
- `X-Forwarded-For`
- `X-Forwarded-Proto`
- `X-Forwarded-Host`
- long read/send timeouts

## Status

READY FOR LIVE VERIFY
