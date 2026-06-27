# IDE Deploy Report

Date: 2026-06-27

## Recommended AWS Deployment

Use OpenVSCode Server Docker image:

```bash
docker run --init \
  -p 127.0.0.1:<port>:3000 \
  -v "$WORKSPACE_STORAGE_DIR/<userId>/<workspaceId>:/home/workspace:cached" \
  gitpod/openvscode-server:latest \
  --host 0.0.0.0 \
  --connection-token <per-session-token>
```

## Nginx Requirements

- Route `/ide/<session>/` to the assigned OpenVSCode port.
- Enable websocket upgrade headers.
- Do not expose OpenVSCode directly to the public internet.
- Enforce Meldex auth before issuing/redirecting to an IDE session URL.

## Meldex Environment

Set one of:

- `MELDEX_OPENVSCODE_URL_TEMPLATE`
- `MELDEX_OPENVSCODE_BASE_URL`

## Deploy Status

Meldex route support is implemented. OpenVSCode service deployment remains blocked.

