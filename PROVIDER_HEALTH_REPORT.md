# Provider Health Report

Date: 2026-06-27

## Implemented

- Added `ProviderHealthEvent`.
- Router records provider success/failure, latency, status code, and safe error metadata.
- Provider config tracks health score, status, last check time, and last error.
- Repeated provider failures degrade health and can mark a provider unhealthy.
- Admin notifications are created for provider errors such as rate limit, credits, timeout, and provider failure.

## Master Panel

- Master → AI Infrastructure now displays provider health status and recent health events.

## Verification

- Build passed.
- Health tables and default providers migrated successfully.
