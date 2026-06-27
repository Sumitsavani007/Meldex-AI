INSERT INTO "AiProviderConfig" (
  "id", "provider", "name", "baseUrl", "apiKeySettingKey", "defaultModel",
  "priority", "isEnabled", "isFallbackEnabled", "maxContextTokens",
  "costMultiplier", "retryCount", "timeoutMs", "rateLimitPerMinute",
  "rateLimitPerHour", "healthStatus", "healthScore", "createdAt", "updatedAt"
) VALUES
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'OPENROUTER', 'OpenRouter', 'https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY', 'qwen/qwen3-coder-30b-a3b-instruct', 10, true, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'OPENAI', 'OpenAI', 'https://api.openai.com/v1', 'OPENAI_API_KEY', 'gpt-4.1-mini', 20, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'ANTHROPIC', 'Anthropic', 'https://api.anthropic.com/v1', 'ANTHROPIC_API_KEY', 'claude-3-5-sonnet-latest', 30, false, true, 200000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'GOOGLE_GEMINI', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'GEMINI_API_KEY', 'gemini-2.0-flash', 40, false, true, 1000000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'DEEPSEEK', 'DeepSeek', 'https://api.deepseek.com/v1', 'DEEPSEEK_API_KEY', 'deepseek-chat', 50, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'GROQ', 'Groq', 'https://api.groq.com/openai/v1', 'GROQ_API_KEY', 'llama-3.3-70b-versatile', 60, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'TOGETHER', 'Together', 'https://api.together.xyz/v1', 'TOGETHER_API_KEY', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 70, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'OLLAMA', 'Ollama', 'http://localhost:11434', null, 'qwen3-coder:30b', 80, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'LOCAL', 'Local Model', 'http://localhost:11434', null, 'local', 90, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now()),
  (concat('aipc_', md5(random()::text || clock_timestamp()::text)), 'CUSTOM_OPENAI_COMPATIBLE', 'Custom OpenAI Compatible', '', 'CUSTOM_AI_API_KEY', 'custom-model', 100, false, true, 128000, 1, 1, 90000, 60, 1000, 'unknown', 100, now(), now())
ON CONFLICT ("provider", "defaultModel") DO NOTHING;

INSERT INTO "RateLimitRule" (
  "id", "key", "description", "requestsPerMinute", "requestsPerHour",
  "requestsPerDay", "burst", "isEnabled", "createdAt", "updatedAt"
) VALUES
  (concat('rlr_', md5(random()::text || clock_timestamp()::text)), 'chat', 'User chat requests', 40, 500, 3000, 10, true, now(), now()),
  (concat('rlr_', md5(random()::text || clock_timestamp()::text)), 'agent_runs', 'Workspace and coding agent runs', 12, 100, 500, 5, true, now(), now()),
  (concat('rlr_', md5(random()::text || clock_timestamp()::text)), 'workspace_actions', 'Workspace create/read/write actions', 80, 1200, 8000, 20, true, now(), now()),
  (concat('rlr_', md5(random()::text || clock_timestamp()::text)), 'preview', 'Preview verify/run requests', 30, 400, 2500, 10, true, now(), now()),
  (concat('rlr_', md5(random()::text || clock_timestamp()::text)), 'downloads', 'Project exports', 10, 80, 300, 3, true, now(), now()),
  (concat('rlr_', md5(random()::text || clock_timestamp()::text)), 'api_access', 'Public or extension API access', 60, 1000, 10000, 20, true, now(), now())
ON CONFLICT ("key") DO NOTHING;
