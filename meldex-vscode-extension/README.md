# Meldex AI for VS Code

Meldex AI is a Codex-style coding assistant for VS Code. It connects to the Meldex production backend and uses the configured Coding Brain to chat, inspect workspace context, propose file changes, preview diffs, apply patches, and run terminal checks.

## Features

- Chat with Meldex from the VS Code sidebar.
- Agent mode with a safe Thinking panel and timeline.
- Changed files summary with per-file `+ / -` counts.
- VS Code diff preview before applying changes.
- Accept / Apply All, Reject, and Undo.
- Terminal command execution with stdout, stderr, exit code, duration, and cwd capture.
- Token or email/password sign-in through the production backend.

## Backend

Default backend:

```text
https://meldex.newsyfly.com
```

Change it from VS Code settings with `meldex.apiUrl` if needed.

## Security

- Tokens are stored in VS Code SecretStorage.
- No cookies are used by the extension.
- The extension does not log raw tokens.
- `.env` files are not read or written by workspace scanning or patch application.
- File changes are previewed before apply.
- Dangerous shell commands are blocked by default.

## Commands

- `Meldex: Open Chat`
- `Meldex: Explain Selection`
- `Meldex: Fix Current File`
- `Meldex: Generate Tests`
- `Meldex: Refactor Selection`
- `Meldex: Run Agent`
- `Meldex: Add Documentation`

## Packaging

```bash
npm install
npm run compile
npx vsce package
```

