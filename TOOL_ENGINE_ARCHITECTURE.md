# TOOL ENGINE ARCHITECTURE

Status: implemented.

Meldex Tool Intelligence Engine adds a metadata-driven tool layer around Qwen3-Coder. The engine lives in `meldex-vscode-extension/src/agent/toolIntelligenceEngine.ts` and is integrated into the Agent CLI before model execution.

## Flow

1. Read workspace index.
2. Build symbol graph and project health signals.
3. Score the tool registry against the user goal, framework, files, commands, and tool memory.
4. Build parallel execution groups.
5. Validate patch/tool outputs before applying.
6. Learn successful tool sequences.

## Registry

The registry includes Workspace, File Search, Symbol, AST, Patch, Terminal, Git, Preview, Build, Test, Lint, Package, Environment, Database, Browser, and Documentation tools. Each tool declares capability, schema, permissions, risk, framework support, latency, confidence, and tags.
