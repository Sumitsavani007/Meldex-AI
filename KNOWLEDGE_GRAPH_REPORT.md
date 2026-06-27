# Knowledge Graph Report

Date: 2026-06-28

## Implemented

- Runtime builds a project graph from visible workspace files.
- Tracks file types, imports, exports, config files, style files, tests, API routes, components, database/model files, and dependencies.
- Workspace context builder now uses graph-aware semantic ranking instead of blindly taking the first files.

## Event

- `knowledge_graph_built`

