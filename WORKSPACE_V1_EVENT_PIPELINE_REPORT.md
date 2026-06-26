# Workspace V1 Event Pipeline Report

## Pipeline

```text
Workspace API
  -> Qwen / Offline Mode / file operations
  -> normalized WorkspaceTaskEvent records
  -> SSE stream
  -> Workspace UI timeline, files, diffs, logs, preview
```

## Persistence

Added model:

- `WorkspaceTaskEvent`

Fields:

- `taskId`
- `projectId`
- `sequence`
- `type`
- `message`
- `payloadJson`
- `createdAt`

Events are ordered by `sequence` and loaded with task history for refresh recovery.

## Normalization

The stream hides internal details and emits user-facing messages such as:

- Thinking
- Reading workspace
- Planning files
- Created index.html
- Diff ready for style.css
- Starting preview
- Preview URL ready
- HTTP 200 verified

Payloads are sanitized to redact tokens, API keys, secrets, and passwords.

