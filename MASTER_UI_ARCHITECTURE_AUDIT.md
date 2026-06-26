# Master UI Architecture Audit

Date: 2026-06-26

## Scope

Inspected:
- `app/layout.tsx`
- `app/globals.css`
- `components/header.tsx`
- `components/ui.tsx`
- `components/dashboard-card.tsx`
- `components/status-badge.tsx`
- `components/empty-state.tsx`
- `components/auth-provider.tsx`
- `app/admin/*`
- `app/admin/master/page.tsx`
- admin APIs used by the Master Panel
- auth redirect and middleware routes

## Current Layout Tree

Current source layout:

```
RootLayout
  AuthProvider
    Header
    main
      /admin/master page
        custom Master header
        custom Master sidebar
        custom Master content
```

Important detail:
- `components/header.tsx` returns `null` for `/admin`, `/master/login`, and `/chat`.
- Therefore root header is not visibly duplicated on `/admin/master`.
- But there is no `app/admin/layout.tsx`, so every admin page creates its own layout and visual system.

## Duplicate / Conflicting Architecture

| Area | File(s) | Finding | Impact |
| --- | --- | --- | --- |
| Admin layout | `app/admin/layout.tsx` missing | No single admin/master shell exists. | Every admin page owns its own spacing, header, and layout choices. |
| Master shell | `app/admin/master/page.tsx` | Page contains its own header, sidebar, content system, modal, toast, nav, and local design primitives. | Master shell cannot be reused and conflicts with other admin pages. |
| Legacy admin dashboard | `app/admin/page.tsx`, `app/admin/benchmarks/page.tsx`, `app/admin/ai/page.tsx` | Uses `SectionShell`, `PageHeader`, `DashboardCard`, `Panel` from `components/ui.tsx`. | Visually older and different from Master Panel. |
| Legacy settings page | `app/admin/settings/page.tsx` | Uses a separate gradient/page/card style. | Looks like a different product. |
| Other admin pages | `app/admin/users`, `projects`, `logs`, `audit`, `system`, `usage` | Each page has its own page wrapper, auth guard, table/card spacing. | No unified enterprise dashboard feel. |
| Global CSS | `app/globals.css` | Provides aurora/grid/glass visual language for whole app. | Conflicts with minimal SaaS target for Master. |
| Shared components | `components/dashboard-card.tsx`, `components/ui.tsx` | Mint/iris/ember/rose palette, rounder cards, decorative blob behavior. | Not aligned with requested Vercel/Linear/Stripe minimal dashboard. |

## Duplicate Navigation

Current navigation sources:
- Root `Header` navigation for user app, hidden on `/admin`.
- `/admin/master/page.tsx` local tabs/sidebar.
- `/admin/page.tsx` admin section grid links.
- Other `/admin/*` pages have standalone titles and sometimes their own local actions.

Finding:
- There is exactly one visible sidebar on `/admin/master`, but not one system-wide admin sidebar.
- Navigating to `/admin/ai`, `/admin/settings`, `/admin/users`, etc. leaves the Master Panel design and enters older page layouts.

## Duplicate Providers

- Only one root `AuthProvider` was found.
- No duplicate `SessionProvider` was found in admin/master.
- No nested provider duplication currently exists.

## Dead / Legacy Components

Legacy components still used by admin pages:
- `components/dashboard-card.tsx`
- `components/ui.tsx` exports `SectionShell`, `Panel`, `PageHeader`, `StatusPill`, `Badge`
- `app/admin/page.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/ai/page.tsx`
- `app/admin/benchmarks/page.tsx`

These should not be used by the new Master Panel layout.

## Button QA Findings

`/admin/master/page.tsx`:
- Main buttons are wired to APIs and have loading/toast behavior.
- But buttons live inside page-owned shell, not a shared layout.

`/admin/settings/page.tsx`:
- Dead `Configure` buttons were previously replaced, but the page remains legacy.

Other admin pages:
- Need page-by-page QA or removal from the visible Master navigation to avoid older UI.

## Required Cleanup Direction

To satisfy “NO MIXED LAYOUTS”:

1. Add one `app/admin/layout.tsx`.
2. Move Master sidebar/header/search/profile/status/collapse into the layout.
3. Remove sidebar/header from `app/admin/master/page.tsx`.
4. Use one design system for Master layout primitives.
5. Route legacy admin pages into the new shell or redirect them to canonical Master sections.
6. Remove old Master page-owned shell primitives.
7. Keep root `Header` hidden for `/admin`.
8. Do not reuse `DashboardCard`, old `SectionShell`, or `glass-panel` in the Master Panel.

## Files To Change

Primary:
- `app/admin/layout.tsx` (new)
- `components/master-shell.tsx` (new)
- `app/admin/master/page.tsx`
- `app/admin/page.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/ai/page.tsx`
- `app/admin/users/page.tsx`
- `app/admin/projects/page.tsx`
- `app/admin/logs/page.tsx`
- `app/admin/audit/page.tsx`
- `app/admin/system/page.tsx`
- `app/admin/usage/page.tsx`
- `app/admin/benchmarks/page.tsx`

Secondary:
- `components/dashboard-card.tsx`
- `components/ui.tsx`
- `app/globals.css`

## Implementation Plan

1. Create `MasterLayout` with one sidebar, one header, one content slot, and right utility placeholder.
2. Convert `/admin/master` into content-only sections.
3. Redirect or replace legacy `/admin/*` pages so no old layouts are visible.
4. Run lint/build.
5. Run live visual review where browser tooling is available; otherwise document limitation and perform HTTP/build route verification.

