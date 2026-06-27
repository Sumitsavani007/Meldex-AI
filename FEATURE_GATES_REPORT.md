# Feature Gates Report

Date: 2026-06-27

## Summary

Implemented DB-driven feature gates for Meldex SaaS plans. Feature availability is now controlled through `FeatureFlag`, `PlanFeature`, and `UserFeatureOverride`, with runtime checks through `canUseFeature(userId, featureKey)`.

## Database

- Added `FeatureFlag`
- Added `PlanFeature`
- Added `UserFeatureOverride`
- Added relations to `Plan` and `User`
- Added migration: `prisma/migrations/20260627140000_feature_gates/migration.sql`

## Runtime Helper

Added in `lib/plans-credits.ts`:

- `FEATURE_FLAGS`
- `FeatureKey`
- `seedDefaultFeatureFlags`
- `listPlanFeatures`
- `canUseFeature`
- `featureBlockedResponse`

Default feature matrix is seeded from plan priority and can be edited later from Master Panel.

## Gated Features

- Workspace creation
- IDE open
- VS Code extension API
- Chat
- Agent runs
- Pro model access
- Context memory
- Preview runtime and workspace run
- Download project
- Parallel tasks
- Storage
- API token creation
- Benchmark token scope

## Master Panel

Added `Master -> Plans -> Plan Features` matrix:

- Toggle global feature active/default state
- Enable or disable each feature by plan
- Edit numeric limits for workspace count, storage, parallel tasks, and pro-model context limit

## QA

- `npx prisma validate`: passed
- `npx prisma generate`: passed
- `npm run lint`: passed with existing warnings only
- `npm run build`: passed

