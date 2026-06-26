# TOOL SELECTION

Status: implemented.

Tool selection is registry-driven, not a fixed command sequence. Each tool is scored from:

- Goal tags
- Framework support
- Risk level
- Historical tool memory
- Project health signals
- Expected validation commands

The engine returns:

- Selected tools
- Confidence
- Execution order
- Parallel groups
- Validation checks
- Retry strategy
- Estimated latency
- Skipped tools

Baseline read-only tools run in parallel where safe. Write and execute tools are ordered behind validation gates.
