# Patch Precision Report

## Implemented

- Preserved existing Codex-style runtime patch guard.
- Kept autofix scope guard that limits syntax fixes to the parsed error file when possible.
- Added coding self-review checks before patch application.
- Added generated-project README requirement.
- Added dependency manifest guard for static-only projects.

## Behavior

- Focused bug fixes remain constrained to relevant files.
- Static projects cannot silently gain package/server files.
- Unsafe or secret-like paths are blocked before apply.
- Low-quality responses are blocked before writing files.

## Verification

The static smoke test changed only:

- `index.html`
- `style.css`
- `script.js`
- `README.md`

No dependency or server files were generated.
