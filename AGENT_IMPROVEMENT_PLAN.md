# AGENT IMPROVEMENT PLAN

## Benchmark Summary

- Total tasks: 50
- Passed: 3
- Failed: 47
- Success: 6%

## Required Next Fixes

- Fix /api/extensions/agent backend/provider availability and expose actionable provider errors before benchmark execution.
- Tune AOE confidence thresholds for deterministic benchmark tasks like README generation.

## Priority Order

1. Fix backend coding-engine availability/diagnostics for `/api/extensions/agent`; this blocked 46/50 tasks before patch generation.
2. Add backend error detail logging/reporting so benchmark reports can distinguish rate limit, provider auth, invalid model, timeout, and malformed provider response.
3. Add preflight model probe before running a benchmark suite; abort early if Qwen backend is unavailable.
4. Lower false clarification stops for simple documentation tasks; static README generation should not stop at 62% confidence.
5. Only score preview failures after a patch/server attempt; backend failures should not be misclassified as preview failures.
