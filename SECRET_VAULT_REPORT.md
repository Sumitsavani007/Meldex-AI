SECRET VAULT REPORT

Implemented:
- Existing AES-256-GCM vault remains the storage mechanism.
- SETTINGS_ENCRYPTION_KEY is required before secrets can be saved.
- Secrets are encrypted at rest and only masked values are returned to the Master Panel.
- saveSetting now records masked audit values for non-secret settings as well as secrets.
- Sync ENV -> Vault encrypts secret settings and audits imports.
- Runtime code reads vault values without returning raw secrets to browser responses.

Security posture:
- No raw secret reveal endpoint was added.
- Copy UX remains masked-only after save.
- Secret replacement is supported; raw stored values are not returned to the frontend.
