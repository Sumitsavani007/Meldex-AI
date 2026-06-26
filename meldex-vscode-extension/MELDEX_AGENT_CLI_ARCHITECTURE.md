# Meldex Agent CLI Architecture

Date: 2026-06-26
Version: `5.1.0`

## Overview

Meldex Agent CLI is the local execution engine behind the VS Code extension.

Flow:

`VS Code Extension -> Meldex Agent CLI -> Meldex Backend -> Qwen3-Coder -> Local Files / Terminal / Git -> JSONL Events -> Extension UI`

## Location

- CLI TypeScript source: `src/cli/main.ts`
- Packaged wrapper: `meldex-agent-cli/bin/meldex-agent.js`
- Compiled runtime: `out/cli/main.js`

## Commands

- `meldex-agent run "<task>"`
- `meldex-agent doctor`
- `meldex-agent index`
- `meldex-agent plan "<task>"`
- `meldex-agent rollback`
- `meldex-agent status`
- `meldex-agent config`

## Core Modules

- Workspace indexer: scans files, hashes, languages, routes, components, scripts, dependencies, git state.
- Context builder: sends minimal relevant files and package metadata.
- Planner: creates structured objective, assumptions, file list, commands, risks, validation plan.
- Backend client: calls `/api/extensions/agent`, `/api/extensions/chat`, `/api/extensions/health` through extension token.
- Patch engine: reads originals, calculates added/removed counts, stores rollback snapshots, applies patches.
- Terminal engine: uses `child_process.spawnSync` with safe command policy and structured event output.
- Memory: stores recent tasks/files in `.meldex/memory.json`.
- Observability: writes task logs under `.meldex/logs/`.

## Extension Integration

`src/agent/agentRunner.ts` now starts the bundled CLI first and consumes JSONL events. The extension remains the UI layer, while CLI owns local execution.
