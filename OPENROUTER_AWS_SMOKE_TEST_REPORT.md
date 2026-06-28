# OpenRouter AWS Smoke Test Report

Date: 2026-06-28

## AWS Environment

- `OPENROUTER_API_KEY`: present, masked in logs.
- `OPENROUTER_BASE_URL`: `https://openrouter.ai/api/v1`
- Env model: `qwen/qwen3-coder`
- DB provider model: `qwen/qwen3-coder-30b-a3b-instruct`

## Smoke Tests

### Tiny Prompt

Prompt: `Return OK`

Result:

- HTTP status: `200`
- finish_reason: `stop`
- response: `OK`
- token usage returned: yes

### Configured Model

Model: `qwen/qwen3-coder-30b-a3b-instruct`

Result:

- HTTP status: `200`
- finish_reason: `stop`
- response: `OK`
- token usage returned: yes

### Large max_tokens Test

`max_tokens: 8192` returned HTTP `402` because the account could not afford the requested completion cap.

## Conclusion

OpenRouter connectivity is healthy. The runtime failure was caused by an oversized completion cap relative to current OpenRouter credits, not by a missing key or invalid model.
