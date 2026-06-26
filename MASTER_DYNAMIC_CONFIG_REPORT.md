MASTER DYNAMIC CONFIG REPORT

Implemented:
- Runtime-editable settings now resolve with vault -> environment -> default priority through lib/runtime-config.ts.
- Boot-critical settings remain environment-first: DATABASE_URL, AUTH_SECRET/NEXTAUTH_SECRET, AUTH_URL/NEXTAUTH_URL, SETTINGS_ENCRYPTION_KEY.
- Added provider config helpers, numeric/boolean helpers, cache invalidation, and reloadRuntimeConfig/clearRuntimeConfigCache aliases.
- Master Panel settings API now includes OpenRouter, Qwen3-Coder, Search, R2, OAuth, AWS, App Runtime, and Security settings.
- Master Panel now shows hot-reload badges and status badges for settings.
- Sync ENV -> Vault now imports the expanded runtime-editable key set, skips existing vault values unless overwrite=true, and invalidates runtime cache.

Verification:
- npx prisma generate passed.
- npm run build passed.

Known limitation:
- Auth.js provider registration still reads OAuth client IDs/secrets from process.env at provider construction time. Master Panel can display/test vault OAuth values, but activating OAuth provider changes may still require app restart.
