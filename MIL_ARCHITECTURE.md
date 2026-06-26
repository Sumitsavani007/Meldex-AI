# MIL Architecture

Meldex Intelligence Layer (MIL) wraps Qwen3-Coder with deterministic engineering intelligence.

## Flow

Request -> AOE task graph -> MIL prediction/risk/style/security/performance -> Qwen optimized action prompt -> patch self-review -> execute/verify -> quality insight -> memory learning.

## Components

- `milEngine.ts`: predictive engine, style adaptation, technical debt, performance, security, risk, impact, quality scoring.
- `workspaceMemory.ts`: long-term project memory and learning store.
- `autonomousOrchestrator.ts`: task graph and role orchestration.
- `qwenOptimizer.ts`: Qwen3-Coder prompt/profile optimizer.

## Model

Primary brain remains Qwen3-Coder. MIL does not replace the model; it improves planning, context, safety, and verification around it.
