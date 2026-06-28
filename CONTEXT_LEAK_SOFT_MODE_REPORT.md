# Context Leak Soft Mode Report

Date: 2026-06-28

## What Was Preserved

The false-positive prompt detector fix remains active:

- Generic words are not treated as required entities.
- Required entities focus on product names, domain terms, and explicit constraints.
- Optional requirements trigger repair recommendations rather than hard blocker states.

## Realtime Behavior

The stream route now emits context leak and repair states as normal activity events instead of leaving the AI panel idle.

## Verification

- Build passed.
- No new hardcoded generic keyword blocker was added in this pass.
