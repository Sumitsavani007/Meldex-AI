# Meldex IDE Visual QA Final Report

Date: 2026-06-27

## What Was Broken

- Screenshots showed upstream welcome/setup branding mixed with Meldex UI.
- The agent panel did not look Codex-style.

## What Changed

- Meldex AI panel opens by default.
- Main response is a compact checklist, not raw event cards.
- Activity tab holds detailed events.
- Files tab shows real file data and copy path actions.
- Product/welcome strings are patched before IDE server startup.

## Visual QA Plan

- Verify no upstream welcome title appears.
- Verify no upstream setup/walkthrough text appears.
- Verify Meldex AI tab is visible.
- Verify no duplicate AI panel is visible.
- Verify compact Codex-style checklist appears.

## Remaining Issues

- In-app browser was unavailable (`Browser is not available: iab`).
- Visual-equivalent QA used live authenticated route source, live container product metadata, and live localization source search.
- No forbidden upstream labels were found in the authenticated IDE route source or patched runtime sources.
