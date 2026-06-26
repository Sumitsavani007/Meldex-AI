# Workspace Render Validation Report

Date: 2026-06-27

## Validation Added

Preview verification now checks more than HTTP 200.

Required:

- HTML entry contains `<!doctype html>` or `<html`.
- HTML does not start with `{` or `[`.
- HTML does not contain raw escaped `\n` spam.
- HTML does not contain model JSON keys such as `plan`, `files`, or `summary`.
- HTML does not contain unresolved `${...}` template placeholders.
- HTML links a CSS asset.
- HTML loads `script.js` when the file exists.
- Linked CSS/JS assets exist and are not raw JSON/model dumps.

## Failure Behavior

If validation fails:

- Preview record is marked `FAILED`.
- Workspace run is marked `FAILED`.
- Workspace task is marked `FAILED`.
- The task is not reported as complete/succeeded only because files changed.

## Test Case

Prompt:

`Create a premium responsive pricing section for an AI SaaS product called Meldex.`

Expected result after deploy:

- `index.html`, `style.css`, `script.js` created.
- `index.html` links `./style.css` and `./script.js`.
- Preview returns valid HTML.
- No raw JSON.
- No escaped `\n` dump.
- No `${...}` placeholders.
- Monthly/yearly toggle JavaScript included.

