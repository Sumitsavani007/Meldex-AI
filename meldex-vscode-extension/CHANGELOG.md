# Changelog

## 5.1.1 - 2026-06-26

- Moved CLI index, logs, rollback, memory, and diff temp files to extension/global storage by default.
- Added `--storage-dir` and `projectLocalMemory: false` default to the bundled CLI.
- Added copy actions for assistant messages, code blocks, terminal output, errors, summaries, file paths, and changed-file lists.
- Refined error cards and changed-file review UX.

## 5.1.0 - 2026-06-26

- Added Meldex Agent CLI local execution engine.
- Integrated VS Code agent mode with bundled CLI JSONL event streaming.
- Added workspace indexing, local memory, rollback snapshots, safe command policy, terminal capture, and doctor/status/config commands.
- Added CLI patch preview events for extension diff review.

## 5.0.2 - 2026-06-26

- Polished agent UX with faster visible thinking summaries.
- Added Codex-style tool activity cards and richer task timeline states.
- Added compact reasoning summary panel without exposing private chain-of-thought.
- Improved slow-response feedback for long-running agent work.
- Refined changed-files review and progressive summary reveal.

## 5.0.1 - 2026-06-26

- Added production QA fixes for the Codex-style extension UI.
- Restored visible token login in the connection screen.
- Removed user-facing model configuration and model payloads.
- Improved terminal command execution safety on macOS/Linux.
- Added marketplace-ready README, changelog, and license.

## 5.0.0 - 2026-06-26

- Added Codex-style Thinking panel.
- Added agent timeline.
- Added patch engine and VS Code diff preview.
- Added changed files panel with line counts.
- Added Apply All, Reject, and Undo flows.
