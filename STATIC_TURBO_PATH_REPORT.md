# Static Turbo Path Report

Date: 2026-06-28

## Goal

Keep HTML/CSS/JS static site tasks fast by skipping heavy systems.

## Implemented

Turbo path skips or minimizes:

- broad memory context
- full graph orchestration
- broad file search
- dependency scan
- repeated repair loops
- old generated file content for fresh standalone tasks

Turbo path uses:

- current prompt
- file contract
- model call
- parser
- critical validation
- file writes
- preview verification

## Cache

In-memory workspace performance cache stores:

- file tree
- project type
- static site flag
- file metadata
- recent active files
- project summary
- style preferences
- last successful output pattern

Cache invalidates naturally on PM2 restart and is refreshed after successful file writes.

## Live Evidence

- First BookNest run: cache miss, workspace load `4ms`, context pack `40ms`
- FAQ edit: cache hit, workspace load `2ms`, context pack `37ms`
- Style-only edit: cache hit, workspace load `2ms`, context pack `38ms`

Target for workspace/context under `500ms` passed.

