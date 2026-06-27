# Audit Log Report

Date: 2026-06-27

## Implemented

- Provider config changes log `AI_PROVIDER_UPDATE`.
- Rate-limit changes log `RATE_LIMIT_UPDATE`.
- Provider health manual marks log `AI_PROVIDER_HEALTH_MARK`.
- Queue actions log `AI_QUEUE_*`.
- User API-key create, revoke, and rotate actions log audit events.
- Successful and failed router calls log AI request audit events.

## User API Keys

- Added hashed `UserApiKey` storage.
- Raw key is shown once on create/rotate only.
- Revoke and rotate are owner-scoped to the authenticated user.

## Verification

- Build passed.
- New audit actions are wired through existing audit infrastructure.
