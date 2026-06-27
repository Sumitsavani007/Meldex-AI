# Meldex IDE Button QA Report

Date: 2026-06-27

## Workspace List

- Workspace card: opens Meldex IDE.
- Open IDE: opens Meldex IDE.
- Open preview: works when preview exists; disabled with reason when unavailable.
- Classic fallback: opens `/workspace/[projectId]/classic`.
- Archive: calls existing workspace PATCH.
- Delete/archive: calls existing workspace DELETE.
- New workspace: creates workspace and opens Meldex IDE.
- Quick prompts: create workspace and open Meldex IDE.

## IDE Shell

- Back to Workspaces: works.
- Open full tab: disabled until IDE session exists; opens IDE URL when ready.
- Retry: retries IDE session creation.
- Back to list in error card: works.

## Notes

OpenVSCode internal buttons are provided by the embedded IDE. Meldex controls around it are either functional or disabled with a clear reason.

## Status

READY
