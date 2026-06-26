# Workspace Memory Report

## Storage

- Database: existing `ProjectContext` table stores normalized safe workspace memory.
- Workspace storage: safe mirror written under project storage at `.meldex/memory.json`.
- Hidden `.meldex` memory folder is excluded from workspace file tree and snapshots.

## Workspace UI

Added a `Memory` tab in the Workspace view with:

- Project summary
- Recent decisions
- Active design/coding style
- Known issues
- Successful fixes
- Last successful commands
- Architecture notes
- Recent tasks
- Save summary
- Clear memory

## Agent Flow

Workspace timeline now shows:

- Loaded workspace memory
- Found related previous task when relevant
- Reused project style when style memory exists
- Avoided previous known issue when known issues exist
- Updated workspace memory after task completion
