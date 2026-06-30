# Global Theme Report

Date: 2026-06-30

## What Changed

- Global theme remains centralized in `components/theme-provider.tsx`.
- The new `AppShell` consumes the same theme source of truth.
- Dashboard, Workspace overview, Settings-compatible pages, and AI Studio now inherit the same dark/light shell behavior.
- AI Studio module controls were moved under the shared shell so its top-level theme no longer conflicts with the global app header.

## Theme Source Of Truth

- `ThemeProvider`
- `localStorage` key: `meldex:theme`
- system preference fallback
- `html.dark`
- `html[data-theme]`
- `color-scheme`

## Verification

- `npm run build` passed.
- TypeScript validation passed.

## Remaining Notes

- Some deep workspace IDE surfaces intentionally use their own embedded IDE theme controls.
