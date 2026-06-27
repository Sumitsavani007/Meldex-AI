# Meldex IDE File Hygiene Final Report

Date: 2026-06-27

## Fixed

- Added `isInternalWorkspaceFile(path)` alongside `isUserVisibleWorkspaceFile(path)`.
- `.cache` is now classified as internal and hidden by default.
- Hidden/internal filtering applies to:
  Explorer, search, file tabs, generated file lists, workspace API tree, and ZIP export.
- Empty filtered folders are hidden.
- Clean empty state now says:
  `No project files yet. Ask Meldex AI to create your app.`
- Show Hidden Files reveals internal files with muted styling and `Internal` labels.
- Hidden mode shows a warning banner.

## Security

- Default Explorer and ZIP export exclude `.env`, tokens/secrets/session metadata, `.vscode`, `.meldex*`, `.cache`, `.git`, and `node_modules`.
- No internal files are deleted; they are only hidden unless the user enables hidden visibility.

## Verification

- Local lint/build passed.
