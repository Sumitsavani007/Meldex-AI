# Phase 4 Benchmark Report

Date: 2026-06-28

## Setup

- Live site: `https://meldex.newsyfly.com`
- Commit: `0460bd98b925345c3dc42d723e67e27f23830056`
- Workspace: `cmqxri9z7000l1wqk2n2q8o10`
- Authenticated QA user: `phase3-1782646789@example.com`
- Plan: `Meldex Pro`

## Benchmarks

| Test | Target | Result | Status | Budget | Bottleneck |
| --- | ---: | ---: | --- | ---: | --- |
| A. BookNest landing page | `<45s` | `38.425s` runtime / `40.088s` stream | Pass | `3800` | model |
| B. Small edit | `<15s` | `29.383s` runtime / `31.493s` stream | Miss | `900` | model |
| C. Add FAQ accordion | `<25s` | `14.991s` runtime / `16.492s` stream | Pass | `1400` | model |
| D. Regenerate style.css only | `<20s` | `36.746s` runtime / `37.998s` stream | Miss | `1200` | model |

## Runtime Details

BookNest:

- model: `35787ms`
- file write: `802ms`
- preview verify: `9ms`
- cache: miss

Small edit:

- model: `26899ms`
- file write: `762ms`
- preview verify: `3ms`
- cache: miss

FAQ edit:

- model: `12652ms`
- file write: `694ms`
- preview verify: `2ms`
- cache: hit

Style-only:

- model: `34571ms`
- file write: `736ms`
- preview verify: `2ms`
- cache: hit

## Verification

- All successful benchmark tasks returned `preview_verified`.
- Runtime profiles persisted to `WorkspaceLog`.
- Static turbo events streamed live.
- Heartbeats streamed during long model calls.
- No fake success was used.

## Remaining Issue

Two targets missed because Qwen/OpenRouter provider response time dominated the run even with compressed prompts and low token budgets. Non-model work is already fast:

- workspace/context: under `100ms`
- file write: under `1s`
- preview verify: under `10ms`

