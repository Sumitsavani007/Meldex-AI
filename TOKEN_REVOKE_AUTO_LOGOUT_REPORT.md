# TOKEN REVOKE AUTO LOGOUT REPORT

Run timestamp: 2026-06-26

## Implemented

- Extension API client listens for `401` auth responses with:
  - `token_revoked`
  - `token_expired`
  - `token_invalid`
- On those errors the extension:
  - clears VS Code SecretStorage
  - clears cached user state
  - stops running agent tasks
  - cancels queued tasks
  - returns to login screen
  - shows a login-required message
- Extension periodically checks auth status with `/api/extensions/me`.
- Extension also validates auth before/through normal chat and agent requests.
- Manual `Refresh Auth Status` button calls `/api/extensions/me`.
- Logout clears local state.
- Logout can revoke the server token first.

## CLI Integration

- Extension-launched CLI receives the same SecretStorage token via `MELDEX_TOKEN`.
- Raw token is not logged.
- Raw token is not passed as `--token`.
- Manual advanced CLI auth remains supported:

```sh
MELDEX_TOKEN=mdx_xxx meldex-agent doctor --auth
```

## Verification

- VS Code extension compile: passed.
- VSIX package: passed.
- Real VS Code Stable install: passed.
- Installed UI contains the Google login flow.
- Installed bundled CLI is executable.

## Blocked

End-to-end revoke auto-logout could not be live-tested because production database migration did not apply and no live token/browser session was available in this shell.
