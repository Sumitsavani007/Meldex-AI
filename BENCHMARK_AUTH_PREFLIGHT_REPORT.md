# BENCHMARK AUTH PREFLIGHT REPORT

Run timestamp: 2026-06-26

## Fixed

The Meldex Agent CLI now discovers tokens only from controlled sources, in this order:

1. `--token`
2. `MELDEX_TOKEN`
3. Extension-provided `benchmark-token.json` in VS Code/Cursor global storage

The CLI no longer scans random historical files for token-like strings.

## New Auth Preflight

Command:

```sh
meldex-agent doctor --auth
```

Checks:

- `GET /api/extensions/me`
- `GET /api/extensions/model-health`

Output includes:

- token presence
- token source
- masked token only
- user email/role when valid
- token expiry when returned by backend
- provider
- model
- provider health status
- model-health message

## Benchmark Preflight

`meldex-agent benchmark` now requires a token unless explicitly run offline. If no token is available, it stops before tasks and prints:

```text
Open VS Code → Meldex → Login → Command Palette → Meldex: Copy Benchmark Token → run benchmark with MELDEX_TOKEN=...
```

If a token is available, benchmark preflight checks:

- `GET /api/extensions/me`
- `GET /api/extensions/model-health`

The benchmark runs only when `model-health` returns `healthy: true`.

## Verification Results

- Missing-token doctor auth preflight: passed failure-path test.
- Missing-token benchmark preflight: passed failure-path test.
- Fake-token doctor auth preflight: passed failure-path test; raw token was not printed.
- Extension compile: passed.
- Next.js production build: passed.

## Current Live Benchmark Status

BLOCKED.

Exact issue: no valid production extension token is available in this session, so `GET /api/extensions/model-health` cannot be confirmed as `200`/healthy and the safe 5-task benchmark cannot honestly be rerun yet.

Next action:

```sh
Open VS Code → Meldex → Login → Command Palette → Meldex: Copy Benchmark Token → run benchmark with MELDEX_TOKEN=...
```

