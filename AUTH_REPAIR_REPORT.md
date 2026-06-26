# Auth Repair Report

Date: 2026-06-26

## Google OAuth

Verified production provider registration:
- `/api/auth/providers` returns `google`
- OAuth sign-in POST redirects to Google
- Redirect URI sent to Google:
  `https://meldex.newsyfly.com/api/auth/callback/google`
- Callback URL cookie points to:
  `https://meldex.newsyfly.com/auth/master-redirect`

## Master Flow

- Master login route: `/master/login`
- Master post-login redirect route: `/auth/master-redirect`
- OWNER and ADMIN redirect to `/admin/master`
- Non-admin users are returned to master login with `error=not_master`
- Guest access to `/admin/master` redirects to master login

## Role Propagation

`lib/auth.ts` refreshes the JWT role from the database when `token.id` exists. This prevents Google adapter users from losing admin/master role during OAuth callback.

## Known Auth Constraint

Auth.js provider registration is startup-time. Google/GitHub credential changes saved in vault require app restart before provider registration changes take effect.

