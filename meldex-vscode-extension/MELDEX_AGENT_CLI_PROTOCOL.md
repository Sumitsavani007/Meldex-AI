# Meldex Agent CLI Protocol

## JSONL Events

The CLI emits one JSON object per line:

- `thinking`
- `plan`
- `tool_start`
- `tool_result`
- `file_change`
- `diff`
- `patch`
- `terminal`
- `error`
- `retry`
- `summary`
- `done`

## Example

```jsonl
{"type":"thinking","message":"Indexing workspace"}
{"type":"plan","objective":"Create a simple landing page"}
{"type":"file_change","path":"index.html","operation":"create","added":46,"removed":0}
{"type":"diff","totalAdded":134,"totalRemoved":0}
{"type":"done","summary":"Created a polished static landing page."}
```

## Action Validation

The CLI validates generated file actions:

- allowed operations: `create`, `edit`, `update`, `delete`
- path must be relative
- path traversal is rejected
- `.env` and secret-like paths are rejected
- invalid backend responses fail safely with JSONL `error`

## Patch Event

The `patch` event carries proposed file contents to the extension for VS Code diff preview. The extension still asks the user to accept or reject through its review UI.
