# Meldex Agent CLI Security

## Secrets

- `.env`, `.env.*`, and secret-like files are excluded.
- Tokens are passed through process environment/arguments by the extension and are never written to logs.
- CLI logs never include backend secrets.

## Safe Command Policy

Blocked:

- `rm -rf`
- `sudo`
- `shutdown`
- `reboot`
- `mkfs`
- `dd ... of=`
- `chmod -R 777`
- `curl | bash`
- `wget | bash`
- `git clean`
- `git reset --hard`
- `docker prune`
- destructive database commands

Manual-confirmation class commands are blocked in safe mode:

- package installs
- `git reset`
- Prisma migrations

## File Safety

- All paths are resolved inside workspace root.
- Path traversal is blocked.
- Rollback snapshots are stored before apply.
- The CLI never auto-commits.

## RBAC

The CLI uses extension bearer tokens and calls normal-user-safe extension APIs. It does not call admin-only `/api/models/test`.
