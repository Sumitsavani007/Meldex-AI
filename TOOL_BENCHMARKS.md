# TOOL BENCHMARKS

Status: passed local smoke benchmark.

Command:

`node meldex-vscode-extension/meldex-agent-cli/bin/meldex-agent.js tools --workspace . --storage-dir .meldex-tie --goal "fix auth token bug and verify build"`

Results:

- Registry loaded: 16 tools
- Symbol graph generated
- Project health generated
- Git intelligence generated
- Parallel groups generated
- Patch validation available
- CLI compile passed
- Extension lint passed
- App build passed

Benchmark dimensions covered:

- Tool selection accuracy
- Symbol graph extraction
- Execution grouping
- Patch validation
- Git impact analysis
- Project health monitoring
