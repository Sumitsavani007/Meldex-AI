# Workspace Final Polish Report

Date: 2026-06-27

## Workspace UX Updates

- Preview card now has SaaS-level status labels and action affordances.
- Changed files actions remain honest: Review and Rollback work; Apply is disabled because workspace changes are auto-applied after verification.
- Logs are reachable from both the tab navigation and preview card.
- Mobile preview refresh now has disabled/loading feedback.
- Preview iframe uses a scoped sandbox and same-origin route.

## Button Rules

Every changed visible Workspace button is one of:

- Working
- Disabled with a clear title/reason

No backend agent or auth behavior was changed.
