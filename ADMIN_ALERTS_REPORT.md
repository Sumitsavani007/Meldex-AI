# Admin Alerts Report

Date: 2026-06-27

## Implemented

Master Analytics derives alerts from real DB signals:

- failed payment events
- failed/canceled workspace tasks
- provider/error workspace logs
- high-cost user concentration
- failed/unverified previews

## UI

Alerts appear in Master Analytics with severity:

- high
- medium
- low

## Notes

OpenRouter balance-low alert requires a provider balance source. The analytics system is ready to display it once the provider health endpoint stores balance signals.
