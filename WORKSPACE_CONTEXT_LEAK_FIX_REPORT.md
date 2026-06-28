# Workspace Context Leak Fix Report

Date: 2026-06-28

## Bugs Fixed

- New standalone prompts could receive old `index.html`, `style.css`, and `script.js` content as relevant context.
- Workspace memory could inject old project summaries and previous task summaries even when the user did not ask to continue prior work.
- Static website reviewer always expected pricing keywords, which could push unrelated prompts toward a pricing page.

## Runtime Changes

- Added current-prompt dominance rules to the Qwen workspace prompt.
- Added standalone task isolation for static website prompts.
- For standalone website generation, old generated file content is intentionally excluded from model context.
- Workspace memory now uses style-only mode unless the prompt explicitly asks to continue, update, modify, restore, same, previous, or existing work.
- Runtime V4 style rules are disabled for standalone generation to prevent old pricing/food/fitness style bleed.
- Added context leak detection for:
  - Gujarati food delivery tasks
  - FitFlow/fitness SaaS tasks
  - Pricing tasks
- If mismatch is detected, the stream route regenerates with isolated context; if still mismatched for static tasks, it uses safe static fallback files.

## Files Changed

- `lib/ai-workspace.ts`
- `lib/workspace-orchestrator.ts`
- `app/api/workspaces/[id]/agent/stream/route.ts`

## Expected Test Results

- `Create a pricing section for Meldex.` should produce pricing content.
- `Create a premium Gujarati food delivery landing page called Tasty Gujarat.` should produce Gujarati food delivery content, not Meldex pricing.
- `Create a premium SaaS platform called FitFlow AI.` should produce fitness SaaS content, not pricing or food delivery.
