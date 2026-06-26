# Memory Security Report

## Protected Data

Memory redaction blocks:

- Extension tokens
- OpenAI/OpenRouter-style keys
- Password assignments
- Token assignments
- API key assignments
- Secret assignments
- Secret-like file paths through existing path guards

## Not Stored

- Raw environment files
- API keys
- Tokens
- Passwords
- Private credentials
- Hidden chain-of-thought

## Stored

- Safe summaries
- Decisions
- File paths
- Diff counts
- Task metadata
- Validation results
- Quality scores
- Known issue summaries
- Successful fix summaries

## Access Control

Workspace memory API uses authenticated workspace ownership checks. Users can only view, edit, or clear memory for their own workspace.
