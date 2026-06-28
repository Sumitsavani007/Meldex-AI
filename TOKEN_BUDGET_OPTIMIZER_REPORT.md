# Token Budget Optimizer Report

Date: 2026-06-28

## Changes

Token budgets were tightened:

- style-only edit: `1200`
- small static edit: `900`
- FAQ/accordion edit: `1400`
- static simple page: `3000-3800`
- premium static page: `3800`
- landing page: `4400`
- app/framework task: `7000-8600`

## Credit-Aware Precheck

Before OpenRouter/Qwen call:

- output budget is estimated
- estimated output tokens are included in credit calculation
- request is blocked before provider call if credits/plan cannot cover it
- stream event `credit_aware_token_budget` is emitted

## Live Evidence

Benchmarks showed the following budgets:

- BookNest premium landing: `3800`
- Small edit: `900`
- FAQ edit: `1400`
- Style-only edit: `1200`

## Result

The previous 5200-token premium path that caused one provider timeout was reduced to a compact 3800-token turbo budget. BookNest completed in `38425ms` total after the adjustment.

