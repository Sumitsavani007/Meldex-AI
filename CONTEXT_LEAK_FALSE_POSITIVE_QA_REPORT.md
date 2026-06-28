# Context Leak False Positive QA Report

Date: 2026-06-28

## QA Cases

### FitFlow AI

Prompt:

`Create a premium SaaS platform called FitFlow AI.`

Expected:

- Does not fail for missing `requirements`.
- Does not fail for missing `pricing` unless pricing is explicitly requested.
- Requires FitFlow/fitness context only.

### Meldex Pricing

Prompt:

`Create a pricing section for Meldex.`

Expected:

- Pricing context is required.
- Meldex entity is preserved.

### Tasty Gujarat

Prompt:

`Create Gujarati food delivery landing page called Tasty Gujarat.`

Expected:

- Gujarati food delivery context is required.
- Meldex pricing content is blocked if leaked.

### Old Workspace Memory

Expected:

- Current prompt dominates workspace memory.
- Memory can provide style hints only unless continuity is explicit.

## Result

The false-positive subject extraction path was removed. Optional requirements now trigger repair hints instead of hard task failure.
