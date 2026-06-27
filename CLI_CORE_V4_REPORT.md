# CLI Core V4 Report

Date: 2026-06-28

## Implemented

- Added shared server-safe Meldex CLI Runtime V4 core in `lib/cli-runtime-v4.ts`.
- Runtime V4 now provides scratchpad, project knowledge graph, semantic file ranking, incremental context packing, task DAG, confidence scoring, local reflection, unified output parsing, and Qwen3-Coder optimized prompt construction.
- Workspace agent stream and non-stream routes now call the same core through `askWorkspaceAgent`.
- VS Code extension agent API now uses the same runtime core before calling the Meldex backend model path.
- Bundled CLI adapter gained V4 event types and helper methods for scratchpad, graph, ranking, local reflection, and patch lifecycle events.

## Model Rule

No new model was added. The implementation keeps the existing Meldex backend/Qwen path and does not introduce GPT-5, DeepSeek, or a new model router.

## Validation

- 5 deterministic runtime validation checks passed.
- `npm run lint` passed with existing workspace hook warnings.
- `npx prisma generate` passed.
- `npm run build` passed.
- Extension `npm run compile` passed.
- `npx vsce package` passed.

