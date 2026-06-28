# Workspace Speed E2E Report

Date: 2026-06-28

## Live BookNest Timing

From the final `speed_benchmark` event:

- first event `understanding_request`: `10ms`
- provider smoke test: `1604ms`
- model request started: `1688ms`
- model response: `73039ms`
- parser: `1ms`
- `index.html` write: `106ms`
- `style.css` write: `124ms`
- `script.js` write: `51ms`
- preview verify: `3ms`
- total: `75379ms`

## Bottleneck

The bottleneck is provider response time plus OpenRouter credit-constrained retry/repair behavior. File persistence and preview verification are fast.

## Realtime Streaming

Events are not batched at the end. The stream emitted:

- early understanding/provider/model-start events
- heartbeat during model wait
- per-file write and save events
- preview start/verified events
- final speed benchmark

## Result

Runtime speed is measured and visible. Generation is functional, but provider response time is the current performance bottleneck.
