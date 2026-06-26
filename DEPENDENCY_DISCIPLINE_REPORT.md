# Dependency Discipline Report

## Implemented

- Static website tasks remain dependency-free by default.
- CLI self-review blocks install commands for static-only tasks.
- CLI self-review blocks framework/server dependency commands for static-only tasks.
- CLI self-review flags dependency install commands when the user did not explicitly ask for dependency/package installation.
- Agent prompts instruct Qwen not to add dependencies unless necessary and already present, and to warn when a dependency is truly required.

## Verification

Static smoke test:

- Prompt: `Create a modern SaaS landing page`
- Generated files: `index.html`, `style.css`, `script.js`, `README.md`
- `package.json`: not created
- `npm install`: not used
- Preview: HTTP 200

## Result

The CLI no longer treats dependency installation as a default path for static websites.
