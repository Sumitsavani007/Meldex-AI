# Plan Access Control Report

Date: 2026-06-27

## Enforcement

Feature access is now resolved from:

1. User override
2. Plan feature mapping
3. Feature default

Blocked premium actions return a structured response:

- `code: FEATURE_NOT_ALLOWED`
- `limitType: feature`
- `featureKey`
- `recommendedPlan`

Existing usage limits still return `PLAN_LIMIT_EXCEEDED`.

## Protected Actions

- `/api/chat` checks `chat`
- `/api/agent` checks `agent_runs`
- `/api/workspaces` POST checks `workspace`
- `/api/workspaces/[id]/agent` checks `agent_runs`, `memory`, `preview_runtime`, and parallel limits
- `/api/workspaces/[id]/agent/stream` checks `agent_runs`, `memory`, `preview_runtime`, and parallel limits
- `/api/workspaces/[id]/ide-session` checks `ide`
- `/api/workspaces/[id]/preview` verify/start checks `preview_runtime`
- `/api/workspaces/[id]/run` checks `preview_runtime`
- `/api/workspaces/[id]/download` checks `download_project`
- `/api/workspaces/[id]/memory` checks `memory`
- `/api/workspaces/[id]/files` write checks `storage`
- `/api/memory` checks `memory`
- `/api/account/tokens` POST checks `api_access` and `benchmark` when benchmark scope is requested
- Extension health/chat/agent/model-health checks `api_access` and `vscode_extension`

## Non-Blocked User Access

Users can still read their own workspace files, list projects, revoke/delete tokens, view history, and open existing content. Gates are applied to premium actions rather than ownership access.

## Notes

No deploy endpoint was present in the current codebase, so a `deploy` feature flag was created and exposed in Master Panel for future deploy actions.

