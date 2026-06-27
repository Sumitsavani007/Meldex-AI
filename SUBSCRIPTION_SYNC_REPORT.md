# Subscription Sync Report

Date: 2026-06-27

## Database

Added:

- `Subscription`
- `PaymentEvent`
- `Invoice`

Added enums:

- `PaymentProvider`
- `SubscriptionStatus`
- `BillingCycle`
- `PaymentEventStatus`
- `InvoiceStatus`

## Sync Behavior

On successful payment or subscription webhook:

- subscription is created or updated
- user plan is assigned
- usage windows continue using DB plan limits
- payment event is stored
- invoice is stored for Stripe invoice events
- notification is created

## Cancellation

Master billing can mark a subscription cancelled locally and record an admin payment event.

Provider-side customer portal/API cancellation is intentionally not hidden as a fake feature. The Master UI shows provider sync as disabled with a clear reason until provider management is added.

## Verification

- Migration applied locally.
- Prisma client generated successfully.
- Production build passed.
