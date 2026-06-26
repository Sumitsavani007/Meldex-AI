# Session Continuity Report

## Supported Follow-Ups

Meldex can now use memory for requests such as:

- `continue previous work`
- `fix the same issue`
- `make it better`
- `use the same style`
- `restore last version`
- `what did we change yesterday?`

## Retrieval Strategy

Before a task, Meldex retrieves:

- Current project summary
- Relevant recent tasks
- Related errors and successful fixes
- Coding style
- Design style
- Recent decisions
- Last successful commands

Only compact relevant memory is injected into the model prompt.

## Update Strategy

After each task, Meldex stores:

- User prompt
- Summary
- Files changed
- Validation state
- Quality score
- Plan decisions
- Errors and fixes
- Preview command
