# Meldex Agent CLI Performance

## Optimizations

- Incremental `.meldex/index.json` stores hashes and changed files.
- `.gitignore` and heavy directories are skipped.
- Context builder selects relevant files instead of sending the whole repo.
- Fast path handles simple static landing pages without a backend generation call when target files do not exist.
- JSONL events are emitted immediately for responsive UI.

## Benchmarks Run

- `doctor`: passed.
- `index`: passed and wrote `.meldex/index.json`.
- `plan "Create a simple landing page"`: passed.
- `run "Create a simple landing page" --apply`: passed with 4 files created.
- `rollback`: passed and removed the created files.
- Live backend run without apply: passed and produced `file_change`, `diff`, `patch`, and `done` events.

## Notes

For complex coding tasks, backend latency depends on Qwen3-Coder/OpenRouter response time. The CLI shows progress instantly and keeps the UI active while waiting.
