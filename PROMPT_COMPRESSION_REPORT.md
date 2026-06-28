# Prompt Compression Report

Date: 2026-06-28

## Changes

Static turbo prompts now omit heavy context:

- Runtime V4 prompt dump
- full memory snippets
- relevant old file content for standalone static generation
- workspace docs/reports
- unrelated old task content

Static fast path now includes only:

- current prompt
- output contract
- design quality contract
- validation rules

Edit prompts now say:

- return only requested changed static files
- do not return unrelated files
- keep complete final content for each returned file

## Why This Matters

Before this fix, small edit prompts still inherited a full static-site contract and could regenerate all three files. After compression, edit prompts are scoped to the requested changed files.

## Live Evidence

- `credit_aware_token_budget` showed small edit budget `900`.
- `credit_aware_token_budget` showed style-only budget `1200`.
- Static edit prompts used `fast_path_selected`.

## Result

Prompt input is materially smaller for static/turbo tasks and avoids old-memory/report bloat.

