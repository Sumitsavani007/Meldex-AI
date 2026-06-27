# Upgrade Flow Report

Date: 2026-06-27

## What Changed

- Added `UpgradeRequest` records for manual upgrade requests.
- Users can request a higher plan from Billing.
- Duplicate pending requests for the same plan are reused instead of creating spam.
- Billing page shows pending/approved/rejected request history.
- User notifications are created for request submitted, approved, and rejected states.

## Admin Flow

- Added Master -> Billing.
- Admin can view upgrade requests.
- Admin can approve a request and assign the requested plan.
- Admin can reject a request with a note.
- Admin can grant bonus credits during approval.

## Payment Status

Checkout is deferred. Upgrade requests are admin-controlled until Stripe/Razorpay is added.
