# Fast Path Tuning Report

Date: 2026-06-28

## Issue

Simple static website prompts were passing through heavier workspace systems that are more useful for complex app tasks.

## Fix

For dependency-free static website prompts:

- Select static fast path.
- Use minimal memory context.
- Skip broad memory context.
- Skip full graph orchestration.
- Skip multi-repair loops.
- Keep one model call, parser, file completeness validation, reviewer/security/performance checks, and preview verification.

## Live QA

- Event `fast_path_selected`: present.
- Memory mode in `context_packed`: `minimal_fast_path`
- Context tokens: `22`
- Relevant files: `0`
- Model request started: `1737ms`
- Preview verified: `HTTP 200`

## Result

Static website generation now takes the shortest safe runtime path while still preserving validation and preview checks.

