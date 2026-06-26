# Workspace V1 Live Deploy Report

## GitHub

- Branch: `main`
- Local commit: `2d0225e8f4635ce1bf7b804ccc2fbf23d8be68ec`
- Origin `main`: `2d0225e8f4635ce1bf7b804ccc2fbf23d8be68ec`
- Push status: passed.

## AWS Deploy

AWS deploy did not run.

Blocker:

```text
ubuntu@16.171.165.221: Permission denied (publickey).
```

Additional checks:

- No SSH identities are loaded.
- No usable private key was found in `~/.ssh`.
- Older EC2 hostname from known hosts timed out.

## Production Live Checks

- `https://meldex.newsyfly.com`: reachable.
- `https://meldex.newsyfly.com/workspace`: redirects to login.
- `https://meldex.newsyfly.com/settings/tokens`: redirects to login.
- `https://meldex.newsyfly.com/api/auth/providers`: returns configured auth providers.
- `https://meldex.newsyfly.com/api/workspaces`: returns `404`.

## Conclusion

Production is still serving old code for Workspace APIs. Deployment is blocked until AWS SSH access is restored.
