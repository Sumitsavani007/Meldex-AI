# BENCHMARK FIXES REPORT

## Scope

Fixed the three CLI benchmark root causes found by the safe 5-task run.

## Fixes

- Static landing page tasks now use the built-in static fast path for blank/static HTML workspaces, even when a starter `index.html` already exists.
- Static landing page fast path writes only `index.html`, `style.css`, `script.js`, and `README.md`.
- Static projects without `package.json` use `python3 -m http.server` for preview verification.
- Package-manager validation commands are skipped as not applicable when a static project has no `package.json`.
- Autofix now skips safety-policy command failures instead of treating them as source defects.
- Autofix now blocks `package.json`, lockfile, or `server.js` dependency/server files in static-only projects.
- Autofix now restricts syntax/type/lint fixes to the parsed failing file and rejects/regenerates broader patches.
- Long-running commands such as `npm start`, `npm run dev`, `next dev`, `vite --host`, `php artisan serve`, and `python -m http.server` are classified as server commands and routed through managed preview handling.

## Verification

- `npm run compile` passed in `meldex-vscode-extension`.
- Rerun showed static Task 1 used `fast_path`, created only the four static files, and verified preview with `python3 -m http.server`.
- Syntax autofix patched only `script.js`.
- Static preview did not require Express, `http-server`, or `npm install`.

