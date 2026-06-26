# Button QA Report

## Working

- Login email/password submit.
- Login access token submit.
- Google/GitHub auth buttons.
- Register submit.
- Logout buttons.
- Workspace create.
- Workspace run agent.
- Workspace stop task.
- Workspace refresh.
- Workspace preview refresh.
- Workspace preview stop.
- Workspace open preview when preview URL exists.
- Workspace copy preview URL.
- Workspace changed file row open.
- Workspace review changed file.
- Workspace reject/rollback.
- Workspace archive.
- Workspace delete.
- Tokens create.
- Tokens copy raw token.
- Tokens revoke.
- Master save setting.
- Master copy masked value.
- Master test provider.
- Master reload config.
- Master sync env.
- Master restart app.
- Master refresh buttons.
- Chat send.
- Chat stop generation.
- Chat copy message.
- Chat retry/edit.
- Chat sidebar conversation actions.

## Disabled With Reason

- Workspace duplicate: not available in V1.
- Workspace apply: changes are already auto-applied after verification.
- Workspace open preview: disabled until preview exists.
- Chat file attachment: not available in this release.
- Chat image attachment: not available in this release.
- Chat voice input: not available in this release.
- Master notifications: not available in this release.
- Master collapsed search: expand sidebar to search.
- Security password change: not available for current login methods.
- Security 2FA: not enabled in this release.
- Security session management: not available in this release.
- Security recovery options: handled by auth provider.
- Profile editing: not available in this release.
- Models edit/delete: no V1 endpoints exist.

## Removed Fake Behavior

- Profile save no longer pretends to save.
- Models save no longer closes without persisting.
- Workspace preview open no longer points to `#`.
