# Workspace UI Fix Report

## Fixed

- Project duplicate button is disabled with reason.
- Project archive button calls `PATCH /api/workspaces/[id]`.
- Project delete button calls `DELETE /api/workspaces/[id]`.
- Changed-file Review opens the first changed file.
- Apply is disabled with an explanation because changes are automatically applied after verification.
- Reject calls rollback.
- Rollback icon is disabled when no active task exists.
- Preview open button is disabled until preview URL is ready.

## Verified

- Workspace routes build successfully.
- Workspace API unauthenticated behavior returns `401`.
- Workspace page redirects when unauthenticated.

## Remaining Notes

- Hook dependency warnings remain non-critical and unchanged.
- Full visual browser screenshot QA could not run because the in-app browser runtime was unavailable.
