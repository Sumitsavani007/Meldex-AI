# Razorpay Integration Report

Date: 2026-06-27

## Implemented

- Razorpay provider mode in payment configuration.
- Razorpay subscription creation through `POST /api/billing/checkout`.
- Razorpay plan mapping per plan:
  - `razorpayPlanIdMonthly`
  - `razorpayPlanIdYearly`
- Razorpay webhook endpoint:
  - `POST /api/billing/webhooks/razorpay`
- Webhook signature verification using `x-razorpay-signature`.

## Handled Events

- `subscription.*`
- payment/invoice payloads are recorded as payment events when received.

## Subscription Sync

Razorpay subscription events create/update:

- `Subscription`
- `PaymentEvent`
- user plan assignment when subscription becomes active
- user notification records

## Security

- Razorpay key secret and webhook secret are stored as secret billing settings.
- Raw secrets are not logged or returned to the client.
- Invalid webhook signatures are rejected.

## QA Result

- Local build/type validation passed.
- Signature verification logic is implemented.
- Live checkout requires configured Razorpay key pair and plan IDs.
