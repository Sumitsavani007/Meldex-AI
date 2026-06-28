# File Completeness Validation Report

Date: 2026-06-28

## Contract

For static website tasks:

- `index.html` must exist.
- `style.css` must exist and be at least 500 characters.
- `script.js` must exist and be large enough for requested interactions.
- `index.html` must link `./style.css`.
- `index.html` must load `./script.js`.
- HTML must not be raw JSON/text.
- Files must not contain unresolved `${...}` placeholders.

## Fix

- Added `staticFileCompletenessIssues`.
- `normalizeWorkspaceFileActions` now rejects blank/too-short CSS and JS.
- Static output falls back to deterministic complete files when parsing or generation is incomplete.
- Preview is blocked if final file completeness fails before preview.

## Verification

- Lint passed.
- Build passed.
