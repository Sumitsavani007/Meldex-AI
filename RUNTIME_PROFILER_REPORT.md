# Runtime Profiler Report

Date: 2026-06-28

## Implemented Profile Fields

Runtime profile now records:

- `request_received_ms`
- `auth_check_ms`
- `workspace_load_ms`
- `memory_load_ms`
- `context_pack_ms`
- `planning_ms`
- `model_request_ms`
- `model_response_ms`
- `parser_ms`
- `validation_ms`
- `repair_ms`
- `file_write_ms`
- `editor_stream_ms`
- `preview_start_ms`
- `preview_verify_ms`
- `total_ms`
- `bottleneck`
- `cache`
- `mode`

## Streaming

The profile is streamed through:

- `runtime_profile`
- `speed_benchmark`
- `done`

Compact UI payload includes:

- total time
- model time
- file time
- preview time
- bottleneck

## Persistence

Runtime profiles are persisted in `WorkspaceLog`:

- `event`: `runtime_profile`
- `metadata`: full runtime profile

Production DB verification found persisted runtime profiles for the Phase 4 benchmark workspace.

## Live Evidence

Latest persisted profile examples:

- Small edit: total `29383ms`, model `26899ms`, bottleneck `model`
- FAQ edit: total `14991ms`, model `12652ms`, bottleneck `model`
- Style-only edit: total `36746ms`, model `34571ms`, bottleneck `model`

