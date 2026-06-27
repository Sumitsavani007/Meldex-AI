# Model Cost Analytics Report

Date: 2026-06-27

## Implemented

Added DB-configurable model cost estimation:

- `ModelUsageConfig.estimatedCostPerCreditCents`

Master → Usage Pricing can edit:

- estimated cost per credit in cents

Master Analytics now shows:

- estimated provider cost
- credit revenue
- margin percentage
- highest cost models
- top expensive users

## Safety

No provider cost is hardcoded. If cost per credit is `0`, analytics shows cost as not configured instead of inventing fake margin.

## Migration

Added migration:

- `20260627130000_saas_analytics_cost_config`
