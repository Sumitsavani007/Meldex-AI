# LSP INTEGRATION

Status: integrated with symbol and diagnostics fallback.

TIE now creates a project symbol graph before model execution and uses it for context/tool selection. In VS Code environments this complements IDE/LSP data; in CLI environments it falls back to deterministic static extraction.

Supported signals:

- Classes
- Interfaces
- Functions
- Exports
- Imports
- Routes
- Components
- Hooks
- API endpoints
- Broken imports
- Missing exports
- Circular dependency candidates

The design keeps the LSP surface behind the Symbol Tool contract so diagnostics, references, rename, definition, hover, code actions, semantic tokens, and workspace symbols can be wired through VS Code APIs without altering the agent loop.
