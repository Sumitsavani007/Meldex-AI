# SAFE 5-TASK BENCHMARK RERUN REPORT

## Result

- Total tasks: 5
- Passed: 5
- Failed: 0
- Provider: OpenRouter
- Model: `qwen/qwen3-coder-30b-a3b-instruct`
- Model health: healthy

## Rerun Evidence

- Report directory: `/Users/sumitsavani/meldex-safe-benchmark-results/fix-rerun-20260626-201442`
- Task 1: `fast_path` used; files created were `index.html`, `style.css`, `script.js`, `README.md`; preview HTTP 200 via `python3 -m http.server`.
- Task 2: dark mode toggle added; package-manager validation skipped because static project has no `package.json`; preview HTTP 200 via managed server.
- Task 3: intentional JS syntax error detected; autofix changed only `script.js`; `node --check script.js` passed.
- Task 4: contact form added; preview HTTP 200 via managed server; no manual server stop needed.
- Task 5: static `index/style/script` HTTP 200; Vite project `npm install` and `npm run build` passed.

## Remaining Notes

- Backend occasionally timed out once during Task 2 and succeeded on retry.
- Static no-dependency rule is now enforced by CLI guards.

