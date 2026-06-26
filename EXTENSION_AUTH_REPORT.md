# EXTENSION AUTH REPORT

Run timestamp: 2026-06-26

## Implemented

- VS Code extension login screen now shows two primary options:
  - Continue with Google
  - Use Access Token
- Email/password login is no longer presented in the extension UI.
- Google login uses a device-code style flow:
  - extension calls `POST /api/extensions/connect/start`
  - browser opens `/connect/device?code=...`
  - web user signs in with the normal Meldex account system
  - user approves VS Code access
  - extension polls `GET /api/extensions/connect/poll`
  - backend returns a one-time `mdx_` extension token
  - extension stores token in VS Code SecretStorage
- Access token login validates with `GET /api/extensions/me`, stores token in SecretStorage, then uses it for chat, agent, CLI, benchmark export, and model health.
- Extension has manual `Refresh Auth Status`.
- Extension logout clears SecretStorage, cached user, chat history, and stops running agent work.
- Extension logout can revoke the current token first.
- Extension-launched CLI receives token only through child-process environment variable `MELDEX_TOKEN`.
- Raw token is not passed as a CLI argument.

## Extension APIs

Updated extension APIs accept `Authorization: Bearer mdx_xxx`:

- `GET /api/extensions/me`
- `GET /api/extensions/model-health`
- `GET /api/extensions/health`
- `POST /api/extensions/chat`
- `POST /api/extensions/agent`

Auth failures now include machine-readable codes such as:

- `token_invalid`
- `token_expired`
- `token_revoked`
- `insufficient_scope`

## VS Code Verification

- Extension compiled: passed.
- Rebuilt VSIX: `meldex-vscode-extension/meldex-ai-5.1.2.vsix`.
- Installed into real VS Code Stable: passed.
- Installed VS Code Stable package contains the new Google login UI.
- Installed bundled CLI remains executable.

## Blocked

Live Google OAuth completion was not tested because this shell cannot interactively complete the browser sign-in and approval flow.
