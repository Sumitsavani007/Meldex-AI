# Workspace Speed Fix Report

Date: 2026-06-28

## Issue

Static landing page tasks were still running through heavy orchestration and could freeze in validation/repair before files were generated.

## Fix

- Added static website fast path in the streaming route.
- Fast path skips heavy workspace orchestration for simple static website prompts.
- Fast path emits:
  - intent detected
  - classified task
  - simple file plan ready
  - static fast path enabled
- Model heartbeat remains every 2 seconds.
- Repair remains soft and bounded.

## Files Changed

- `app/api/workspaces/[id]/agent/stream/route.ts`
- `lib/ai-workspace.ts`

## Verification

- `npm run lint` passed.
- `npm run build` passed.

## Result

Simple landing page prompts reach model generation faster and avoid pre-file repair stalls.
