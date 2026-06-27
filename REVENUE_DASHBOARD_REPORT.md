# Revenue Dashboard Report

Date: 2026-06-27

## Implemented

Master Analytics now shows:

- MRR
- ARR
- gross revenue
- failed payments
- refunds
- paid users
- free users
- trial users
- churned users
- revenue by plan

## Calculation Rules

- MRR uses active/trialing/past-due subscriptions.
- Yearly subscriptions are divided by 12 for MRR.
- Gross revenue uses paid invoices in the selected date range.
- Refunded invoices subtract from revenue when present.
- Failed payments count failed invoices and failed payment events.

## Exports

Revenue CSV:

- `/api/admin/analytics?range=30d&export=revenue`

## Notes

All plan names, prices, and limits come from the DB.
