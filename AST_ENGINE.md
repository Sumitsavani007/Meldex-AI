# AST ENGINE

Status: integrated planning layer.

The AST engine classifies edits by file type and chooses structured editing mode:

- `ast`: TypeScript, JavaScript, JSX, TSX, PHP, Python
- `structured-json`: JSON
- `markdown-structure`: Markdown
- `text-fallback`: unsupported plain text formats

Every patch is validated through safe path checks, secret-file blocking, required content checks, syntax-oriented strategy metadata, diff preview, and rollback support. Full parser-backed rewrite hooks are now centralized in the TIE strategy layer so future parsers can be added without changing the orchestration loop.
