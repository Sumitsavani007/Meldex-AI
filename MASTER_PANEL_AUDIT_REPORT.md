# Master Panel Audit Report

Audit date: 2026-06-26

Scope audited:
- `/admin/master`
- Admin dashboard routes under `/admin/*`
- Admin APIs under `/api/admin/*`
- Google OAuth and master login redirect flow
- `auth.ts`, `auth.config.ts`, `middleware.ts`
- Runtime config, vault, provider health, R2/search/model router paths
- Master Panel button handlers, forms, tables, loading/error states

## Executive Summary

The Master Panel is partially functional but not yet production-complete. Several root-cause fixes are already present, including guarded overview data, master login route, OAuth role refresh from DB, runtime-config access for OpenRouter/R2/search, and provider-health APIs. However, the UI is still a mixed admin/control-center implementation, some buttons still use browser `alert()` / `confirm()`, several actions have weak or missing feedback, and the current Master Panel does not fully match the requested SaaS-level structure.

Google OAuth wiring is mostly corrected for role propagation, but OAuth provider registration still depends on startup-time `process.env` values. Vault-loaded OAuth credentials can work only when loaded before `auth.ts` initializes or after app restart. This must be treated as boot/startup-sensitive, not fully hot-reloadable.

## Broken Routes / Route Risks

| Area | File | Finding | Severity |
| --- | --- | --- | --- |
| Master Panel | `app/admin/master/page.tsx` | Single large client component mixes runtime settings, integrations, diagnostics, users, conversations, and audit UI. It is not aligned with the required section structure and has old/new UI patterns mixed. | High |
| Admin Settings | `app/admin/settings/page.tsx` | Contains visible `Configure` buttons with no click handlers. These are dead buttons. | High |
| Admin dashboard | `app/admin/page.tsx` | Uses a different design system (`SectionShell`, `DashboardCard`, mint/iris/ember palette) than `/admin/master`, causing old/new UI inconsistency. | Medium |
| Master route guard | `app/admin/master/page.tsx` | Client-side redirect is present, while middleware/API guards also exist. This is acceptable as a second layer, but the server route itself is still rendered as a client page. | Medium |
| Missing admin layout locally | `app/admin/layout.tsx` | No local admin layout file was found. Production may have one from previous deployments, but local source does not provide a unified shell/logout flow. | Medium |

## Broken Buttons / Weak Button UX

| Button | File | Current State | Required Fix |
| --- | --- | --- | --- |
| Save setting | `app/admin/master/page.tsx` | Calls API and updates state, but errors use `alert()` and success is a small inline state only. | Add consistent toast, inline validation, and error parsing. |
| Sync ENV -> Vault | `app/admin/master/page.tsx` | Uses `alert()` for success/error. Does not offer overwrite confirmation even though API supports `overwrite=true`. | Replace with modal/toast and explicit overwrite flow. |
| Restart App | `app/admin/master/page.tsx`, `app/api/admin/master/restart/route.ts` | Uses `confirm()`. API hardcodes PM2 app name `meldex-ai`. | Replace with confirmation modal; make PM2 app configurable or show disabled explanation if unavailable. |
| Reload Config | `app/admin/master/page.tsx` | Calls API but shows no loading, success, or provider-health result. | Add loading state, toast, and active model/provider refresh. |
| Copy masked value | `app/admin/master/page.tsx` | Copies silently with no success/failure feedback. | Add toast and disabled state when clipboard fails. |
| Reveal icon in vault row | `app/admin/master/page.tsx` | Reveals only replacement input text, not saved secret. This is safer but can be confused with secret reveal. | Rename/clarify as input visibility or remove from saved-secret context. |
| Test all integrations | `app/admin/master/page.tsx` | Fires concurrent tests but only one `testingId` state exists, so loading state is incorrect for multiple tests. | Track per-provider testing state. |
| User role update | `app/admin/master/page.tsx`, `app/api/admin/users/route.ts` | UI only lists users; no role update handler/API exists. | Add guarded role-update flow or remove role-management expectation. |
| Admin settings Configure | `app/admin/settings/page.tsx` | Dead buttons. | Remove or wire to real sections. |

## Old/New UI Conflicts

- `/admin/master` uses a dark-only amber/violet control-center style.
- `/admin` and other admin pages use `components/ui`, `DashboardCard`, and a mint/iris/ember dashboard style.
- Master Panel still includes a `conversations` tab that was not part of the requested final Master structure.
- Required sections missing or incomplete as first-class tabs:
  - `AI Models`
  - `Runtime`
  - `Credentials Vault`
  - `Integrations`
  - `Audit Logs`
  - `Diagnostics`
  - `Users`
  - `Overview`
- Current UI has useful pieces, but the information architecture does not match the requested SaaS control center.

## Auth Bugs / OAuth Risks

| File | Finding | Status |
| --- | --- | --- |
| `lib/auth.ts` | JWT callback now refreshes role from DB when `token.id` exists. This fixes OAuth users defaulting to `USER` after Google login. | Good |
| `app/master/login/page.tsx` | Separate master login route exists. | Good |
| `app/auth/master-redirect/page.tsx` | Redirects OWNER/ADMIN to `/admin/master`, normal user to master login with `error=not_master`. | Good |
| `app/auth/redirect/page.tsx` | Routes OWNER to `/admin/master`, ADMIN to admin/requested admin path, USER to dashboard/requested user path. | Good |
| `middleware.ts` | Guests accessing `/admin/*` go to `/master/login`; non-admin users go to `/unauthorized`. | Good |
| `lib/auth.ts` | Google/GitHub providers are registered from `process.env` at startup. Vault changes are not truly hot-reloadable for Auth.js provider registration. | Risk |
| `lib/vault-loader.ts` | Loads vault values into `process.env` only if env key is absent and only at startup. This supports vault-backed OAuth after restart, not immediate hot reload. | Risk |

Required Google OAuth production values:
- Callback URL: `https://meldex.newsyfly.com/api/auth/callback/google`
- Origin: `https://meldex.newsyfly.com`

## API Bugs / API Gaps

| API | Finding | Severity |
| --- | --- | --- |
| `app/api/admin/master/settings/route.ts` | Admin can save secrets. Requirement says SuperAdmin-only for secret update/reveal. Current guard is `requireAdmin()`, so ADMIN can update secrets. | Critical |
| `app/api/admin/master/sync-env/route.ts` | Admin can sync secrets into vault. Requirement says SuperAdmin-only for secret operations. | Critical |
| `app/api/admin/master/restart/route.ts` | Admin can restart app. This is high-risk and should be OWNER-only or separately confirmed/rate-limited. | High |
| `app/api/admin/users/route.ts` | GET only. No role/status/last-login management despite Master Panel requirement. | Medium |
| `app/api/admin/audit/route.ts` | Reads `auditLog`, while secret-vault writes to `systemSettingAudit`. Master audit view misses vault-specific audits. | High |
| `app/api/admin/master/test/route.ts` | Good provider test coverage exists, but R2 test only lists bucket, not upload/delete tiny test as requested. | Medium |
| `app/api/admin/providers/openrouter/test/route.ts` | Exists and returns structured provider result. | Good |
| `app/api/extensions/model-health/route.ts` | Exists and requires extension token. | Good |

## Runtime Config Bugs / Gaps

Direct runtime env reads found:
- `lib/auth.ts`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`
- `lib/env.ts`: static reads for Google, GitHub, OpenRouter, R2, Qwen, provider values

Assessment:
- `lib/auth.ts` is startup-sensitive because Auth.js provider registration cannot be safely hot-reloaded at request time without reinitializing auth config. This should be documented in UI as restart-required for OAuth provider activation even if vault stores the credential.
- `lib/env.ts` should not be imported by hot runtime paths for runtime-editable settings. Current audited runtime paths for model router, R2, and search use `runtime-config`, but this needs a full import graph check before final signoff.
- `runtime-config.ts` correctly prioritizes vault over env for hot-reload keys and env over vault for boot-critical keys.
- `vault-loader.ts` intentionally does not override existing env values, so ENV can still win at startup for Auth provider registration.

## Security Issues

| Area | Finding | Required Fix |
| --- | --- | --- |
| Secret update authorization | `requireAdmin()` is used for secret write/sync APIs. | Use OWNER/SuperAdmin for secret writes, sync, restart, and any reveal path. |
| Secret reveal | No raw saved-secret reveal API found. Good. | Keep reveal disabled unless session/password confirmation and audit are implemented. |
| Audit coverage | Vault changes are written to `SystemSettingAudit`, but Master Panel audit reads `AuditLog`. | Surface both audit sources or merge in API response. |
| CSRF/rate limit | Admin mutation APIs rely on session auth but no explicit CSRF/rate limit was found. | Add rate limiting and origin checks for sensitive POSTs. |
| Logs | Provider-health sanitizes API keys in messages. Good. | Keep no raw secrets in frontend/network. |

## Exact Files To Fix

Primary:
- `app/admin/master/page.tsx`
- `app/api/admin/master/settings/route.ts`
- `app/api/admin/master/sync-env/route.ts`
- `app/api/admin/master/restart/route.ts`
- `app/api/admin/audit/route.ts`
- `app/api/admin/users/route.ts`
- `lib/role-guard.ts`
- `lib/runtime-config.ts`
- `lib/secret-vault.ts`
- `lib/auth.ts`
- `lib/vault-loader.ts`
- `middleware.ts`
- `app/login/login-form.tsx`
- `app/master/login/page.tsx`
- `app/auth/redirect/page.tsx`
- `app/auth/master-redirect/page.tsx`

Secondary UI consistency:
- `app/admin/page.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/ai/page.tsx`
- `components/ui.tsx`
- `components/dashboard-card.tsx`
- `components/status-badge.tsx`

Reports still required after repair:
- `MASTER_PANEL_FULL_REPAIR_REPORT.md`
- `MASTER_PANEL_UI_REPORT.md`
- `AUTH_REPAIR_REPORT.md`
- `BUTTON_QA_REPORT.md`
- `RUNTIME_CONFIG_REPORT.md`
- `PRODUCTION_DEPLOY_REPORT.md`

## Implementation Order

1. Harden admin mutation APIs: OWNER-only for secret update, env sync, restart; merge vault audit logs.
2. Rebuild `/admin/master` into one consistent SaaS UI with required sections and working buttons.
3. Remove dead buttons from admin settings or route them to real Master sections.
4. Improve reload/sync/save/test UX with loading, success, and error toasts.
5. Clarify OAuth credential behavior: vault can store credentials, but provider registration requires startup/restart.
6. Run local build and production smoke tests.
7. Deploy to AWS only after local build passes.

