# Billing Webhook QA Report

Date: 2026-06-27

## Endpoints

- `POST /api/billing/webhooks/stripe`
- `POST /api/billing/webhooks/razorpay`

## Security Checks

- Stripe webhook requires configured `STRIPE_WEBHOOK_SECRET`.
- Razorpay webhook requires configured `RAZORPAY_WEBHOOK_SECRET`.
- Invalid signatures return an error before processing.
- Webhook payloads are stored as payment metadata, not logs.
- Secrets are never returned to clients.

## Build Verification

- `npx prisma validate`: passed
- `npx prisma generate`: passed
- `npx prisma migrate deploy`: passed locally
- `npm run lint`: passed with existing unrelated warnings
- `npm run build`: passed

## Remaining Provider QA

End-to-end provider sandbox checkout requires live/test Stripe or Razorpay credentials and plan/price IDs configured in Master Panel.
