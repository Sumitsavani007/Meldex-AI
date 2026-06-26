# MIL Security

MIL security intelligence scans relevant context and proposed patches for:

- possible secrets
- raw HTML injection
- command/code injection
- SQL injection
- secret file writes
- unsafe paths

High or critical security findings can block a patch before it is applied.

The system also keeps install commands gated by user confirmation and avoids storing secret material in workspace memory.
