# OpenVSCode AWS Deploy Report

Date: 2026-06-27

## Result

OpenVSCode Server is deployed on AWS and connected to Meldex through the protected IDE route.

## Deployed Commit

- GitHub/AWS commit: `3fd1d907a1fa3e324f121cbc6fd98fff169bccc6`
- AWS app path: `/home/ubuntu/meldex-ai`
- PM2 apps:
  - `meldex-ai`
  - `meldex-openvscode-proxy`

## AWS Install

- Docker installed and enabled on AWS.
- OpenVSCode image used: `gitpod/openvscode-server:latest`
- Docker socket access repaired for the PM2 app user with an ACL on `/var/run/docker.sock`.
- Prisma migration deploy completed with no pending migrations.
- Production build completed.

## Runtime Fixes

- Removed conflicting Docker args that caused OpenVSCode to restart:
  - Removed duplicate `--host`
  - Removed `--connection-token`, because the Docker image defaults to `--without-connection-token`
- Added `--server-base-path /ide/<workspaceId>` so the workbench runs correctly under the Meldex reverse-proxy path.
- Added restart-loop detection so stale broken containers are recreated instead of reused.

## Live Container Evidence

- Target workspace container: `meldex-ide-cmqvmiacu0000mpqkriem6lwf`
- Status: `Up`
- Port binding: `127.0.0.1:49992->3000/tcp`
- Command: `["--server-base-path","/ide/cmqvmiacu0000mpqkriem6lwf"]`

## Status

READY
