# Meldex Agent CLI Extension Integration

## Integration Point

`src/agent/agentRunner.ts`

The extension now attempts to run:

`node meldex-agent-cli/bin/meldex-agent.js run "<task>"`

Arguments passed:

- `--workspace`
- `--backend`
- `--token`

## UI Consumption

The extension maps JSONL events to existing UI:

- `thinking` -> Thinking panel
- `plan` -> timeline
- `tool_start` / `tool_result` -> tool activity cards
- `file_change` -> timeline and changed file activity
- `diff` -> diff status
- `patch` -> VS Code diff preview and Accept/Reject UI
- `terminal` -> terminal output card
- `error` -> clean retryable error
- `done` -> final summary

## Fallback

If the bundled CLI wrapper is missing, the old in-extension runner remains as fallback. In packaged builds the wrapper is included.
