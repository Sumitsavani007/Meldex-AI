# IDE Deploy Report

Date: 2026-06-27

## AWS Deployment

Use OpenVSCode Server Docker image per workspace:

```bash
docker run --init \
  -p 127.0.0.1:<port>:3000 \
  -v "$WORKSPACE_STORAGE_DIR/<userId>/<workspaceId>:/home/workspace:cached" \
  gitpod/openvscode-server:latest \
  --host 0.0.0.0 \
  --connection-token <per-session-token>
```

## Nginx Requirements

- Route `/ide/` to the Meldex OpenVSCode proxy on `127.0.0.1:3101`.
- Enable websocket upgrade headers.
- Do not expose OpenVSCode directly to the public internet.
- Enforce Meldex auth before issuing/redirecting to an IDE session URL.

## Meldex Environment

Meldex now uses:

- `MELDEX_IDE_PROXY_PORT`, default `3101`
- `MELDEX_IDE_SESSION_FILE`, default `/tmp/meldex-openvscode-sessions.json`
- `MELDEX_IDE_PORT_BASE`, default `41000`
- `MELDEX_IDE_PORT_SPAN`, default `12000`

## Deploy Status

Meldex route, session manager, and proxy script are implemented.
