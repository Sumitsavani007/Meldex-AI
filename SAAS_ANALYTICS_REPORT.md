# SaaS Analytics Report

Date: 2026-06-27

## Implemented

- Added Master Analytics API: `GET /api/admin/analytics`.
- Added Master Panel analytics view at `/admin/master?section=analytics`.
- Added `/admin/usage` redirect to Master Analytics.
- Removed fake user analytics data by redirecting `/settings/analytics` to real usage.

## Real DB Sources

- `Subscription`
- `Invoice`
- `PaymentEvent`
- `UserPlan`
- `Plan`
- `CreditTransaction`
- `ModelUsageConfig`
- `WorkspaceProject`
- `WorkspaceTask`
- `WorkspacePreview`
- `WorkspaceFile`
- `WorkspaceLog`
- `WorkspaceTaskEvent`

## Metrics

- MRR, ARR, gross revenue
- active subscriptions, trial users, free users, paid users, churned users
- revenue by plan
- credits used
- AI task count and failed task count
- workspace count and storage
- provider/error log count
- top users by usage

## Filters

Supported ranges:

- today
- 7 days
- 30 days
- current month
- custom range via API

## Verification

- `npm run lint` passed with existing unrelated warnings.
- `npx prisma generate` passed.
- `npx prisma migrate deploy` passed locally.
- `npm run build` passed.
