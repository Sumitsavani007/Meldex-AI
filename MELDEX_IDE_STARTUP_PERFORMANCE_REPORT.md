# Meldex IDE Startup Performance Report

Date: 2026-06-27

## Changes

- `/workspace/[projectId]/ide` renders a Meldex loading shell immediately.
- Container startup moved behind `POST /api/workspaces/[id]/ide-session`.
- Loading states:
  - Preparing workspace
  - Starting Meldex IDE
  - Connecting
  - Ready
- Existing session/container reuse remains in `lib/openvscode-manager.ts`.
- Restart-looping or incorrectly configured containers are detected and recreated.

## Expected UX

Users no longer wait on a blank server-rendered page while Docker/OpenVSCode starts. They see Meldex-branded progress and retry/back controls.

## Status

READY
