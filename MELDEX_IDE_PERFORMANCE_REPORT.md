# Meldex IDE Performance Report

Date: 2026-06-27

## Improvements

- IDE session prewarm added from workspace list and create flow.
- Running IDE sessions are reused when session TTL is valid.
- Old containers are recreated only when the runtime label/version does not match.

## Local Measurements

- `npm run build`: completed successfully.
- Workspace IDE route bundle: `5.7 kB`, first-load JS `111 kB`.
- Workspace index route bundle: `6.53 kB`, first-load JS `123 kB`.

## Production Measurement Plan

After deployment:

- Verify first authenticated `/workspace/[id]/ide` load.
- Verify second load reuses running session.
- Verify WebSocket handshake returns `101 Switching Protocols`.
- Verify container label is `native-v3`.
