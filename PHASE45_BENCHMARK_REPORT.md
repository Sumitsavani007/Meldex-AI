# Phase 4.5 Benchmark Report

Date: 2026-06-28

## Environment

- Production: `https://meldex.newsyfly.com`
- Workspace: `cmqxsapxv000l63qkig8c8zuk`
- Model: `qwen/qwen3-coder-30b-a3b-instruct`
- Provider: OpenRouter / Novita
- Deployed commit: `7dfcd9688b2f25d9c17f6b530729973d46f67a27`

## Baseline

Created a BookNest AI landing page before edit tests.

- Baseline generation total: `101.814s`
- Files created: `index.html`, `style.css`, `script.js`
- Preview: HTTP 200

## Edit Benchmarks

| Test | Target | Total | Model | Saved File | Patch | Preview | Result |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| Change hero headline | <15s | 6.511s | 2.260s | `index.html` | yes | HTTP 200 | pass |
| Change primary color to purple | <12s | 5.336s | 2.191s | `style.css` | yes | HTTP 200 | pass |
| Add one FAQ item | <18s | 9.163s | 5.494s | `index.html` | yes | HTTP 200 | pass |
| Increase card spacing | <12s | 7.986s | 5.015s | `style.css` | yes | HTTP 200 | pass |

## Output Budget Evidence

- Style edits used `maxTokens: 650`.
- HTML edits used `maxTokens: 900`.
- All final edit runs queued exactly one file operation.

## Bottleneck

Model response remains the dominant cost, but patch mode reduced the end-to-end edit time from the previous 29-36s range to 5.3-9.2s.

## Result

Phase 4.5 passed live authenticated QA.

