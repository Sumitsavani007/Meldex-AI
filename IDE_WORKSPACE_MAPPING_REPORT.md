# IDE Workspace Mapping Report

Date: 2026-06-27

## Mapping Rule

Each Meldex workspace opens exactly its stored workspace folder:

`WORKSPACE_STORAGE_DIR/<userId>/<workspaceSlug-or-storage-folder>/`

The IDE manager uses the `WorkspaceProject.storagePath` already created by Meldex workspace storage.

## Target Workspace QA

- Workspace ID: `cmqvmiacu0000mpqkriem6lwf`
- Container: `meldex-ide-cmqvmiacu0000mpqkriem6lwf`
- Mounted source:
  - `/home/ubuntu/meldex-workspaces/cmqtdip0i000og6qklhtttx1n/asset-loading-qa-1782520206903`
- Mounted destination:
  - `/home/workspace`

## Safety Rules

- No shared global source root is exposed.
- Container receives only the workspace storage folder.
- Containers are named per workspace ID.
- The route uses Meldex ownership checks before any session is created.
- Proxy route validates the active workspace session token.

## Status

READY
