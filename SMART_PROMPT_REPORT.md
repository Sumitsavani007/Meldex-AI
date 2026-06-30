# Smart Prompt Report

Date: 2026-06-30

## What Was Built

- Added prompt duration parsing inside AI Studio.
- The parser detects duration phrases such as:
  - `5 second`
  - `10 sec`
  - `30 seconds`
  - `1 minute`
- If the user has not manually changed the duration selector, the parsed duration updates the video length automatically.
- Once the selector is manually changed, manual selection wins over prompt parsing.

## Behavior

- Prompt-driven duration keeps the UI fast for natural language prompts.
- Manual duration changes remain explicit and stable.
- Credit estimates refresh after duration changes.

## Verification

- `npm run build` passed with the parser included in the Studio client bundle.

## Remaining Notes

- Parser intentionally clamps to supported selector values so unsupported durations do not create invalid provider settings.
