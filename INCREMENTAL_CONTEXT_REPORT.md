# Incremental Context Report

Date: 2026-06-28

## Implemented

- Runtime packs context in priority order:
  1. current user request
  2. active/ranked files
  3. scratchpad
  4. graph summary
  5. memory snippet
  6. style rules
- Secrets and generated folders are excluded.
- Context has a character budget and emits compression events when files are omitted.

## Events

- `context_packed`
- `context_compressed`

