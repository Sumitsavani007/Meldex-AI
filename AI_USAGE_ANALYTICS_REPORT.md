# AI Usage Analytics Report

Date: 2026-06-27

## Implemented

Master Analytics now shows:

- total credits used
- credits by model
- credits by provider
- input/output tokens
- average credits per task
- retries
- autofix count
- preview runs
- memory reads/writes when recorded
- top users by usage

## Data Source

Usage comes from `CreditTransaction.metadataJson`, created by the existing credit usage engine.

## Exports

- `/api/admin/analytics?range=30d&export=usage`
- `/api/admin/analytics?range=30d&export=user-usage`
- `/api/admin/analytics?range=30d&export=credit-transactions`

## QA

The dashboard uses empty states when no AI usage exists in the selected range.
