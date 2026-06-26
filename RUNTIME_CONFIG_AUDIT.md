RUNTIME CONFIG AUDIT

Audited direct env usage for:
- OPENROUTER_*
- QWEN_*
- MELDEX_BRAIN_PROVIDER
- R2_*
- SERPER_API_KEY
- BRAVE_API_KEY
- GOOGLE_*
- GITHUB_*

Changed:
- model-router already used runtime-config and now returns richer provider errors.
- extension agent now uses model-router instead of raw OpenRouter fetch.
- web chat and extension chat now return structured provider errors.
- search provider selection now uses runtime-config.
- R2 client now uses vault-aware async runtime config and rebuilds when config changes.
- admin overview/test routes now use vault-aware runtime config.

Remaining env reads:
- lib/auth.ts keeps OAuth provider registration on process.env because Auth.js provider setup is boot-time.
- lib/env.ts remains a boot/runtime validation module and should not be used for hot-reload runtime paths.
