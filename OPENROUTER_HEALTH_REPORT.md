OPENROUTER HEALTH REPORT

Implemented:
- Added lib/provider-health.ts for sanitized OpenRouter health checks and provider error shaping.
- Added GET /api/admin/providers/openrouter/test for admin-only OpenRouter testing.
- Added GET /api/extensions/model-health for extension-token model health checks.
- OpenRouter test checks API key presence, selected model, simple completion, HTTP status, retry-after, request id, and latency.
- Provider errors are mapped for 401, 403, 404, 429, 402, timeout, and network failures.

Safety:
- API keys and provider secrets are never returned in health responses.
- Error reasons are sanitized before returning to clients.
