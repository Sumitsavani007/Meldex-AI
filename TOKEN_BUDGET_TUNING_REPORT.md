# Token Budget Tuning Report

Date: 2026-06-28

## Issue

Workspace generation used a broad `8192` max token budget for all tasks, which was excessive for simple static website prompts and previously contributed to provider credit failures.

## Fix

Added dynamic output budgeting in `askWorkspaceAgent()`:

- Simple static landing page: `3500-5000`
- Premium static page: `5000-6500`
- Large app/framework project: `8000+`
- Standard workspace task: compact default budget

## Live QA

For the BookNest premium static landing page:

- Budget category: `premium_static_page`
- Max tokens: `5600`
- Target range: `5000-6500`
- Output tokens used: `5600`
- Tokens/sec: `108.92`
- Provider/model stayed unchanged:
  `Qwen3-Coder 32B / Novita` through OpenRouter.

## Result

The runtime no longer blindly uses `8192` tokens for every task. Static website output is now budgeted according to task size and quality needs.

