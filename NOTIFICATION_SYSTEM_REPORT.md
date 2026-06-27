# Notification System Report

Date: 2026-06-27

## Summary

Implemented SaaS-level notification infrastructure for billing, credits, limits, workspace, security, and system events.

## Database

Added:

- `Notification`
- `NotificationTemplate`
- `NotificationPreference`
- `EmailDeliveryLog`
- `NotificationSeverity`
- `NotificationChannel`
- `NotificationDeliveryStatus`

Migration:

- `prisma/migrations/20260627143000_notifications/migration.sql`

## Notification Types

Implemented default templates for billing, credits, workspace, security, and system alerts including payment status, subscription changes, credit thresholds, workspace events, token events, provider/model issues, maintenance, deploy completion, and weekly usage summary.

## Runtime

Added `lib/notifications.ts`:

- `seedNotificationTemplates`
- `createNotification`
- `sendEmailNotification`
- `getNotificationPreference`
- `createWeeklyUsageSummary`

Existing `createUserNotification` now bridges old `UserNotification` records into the new `Notification` system for compatibility.

## Triggers

- Credit usage >= 80% creates low-credit notification.
- Credit usage >= 100% creates exhausted/limit notification.
- Token create/revoke creates security notification.
- Workspace creation creates workspace notification.
- Agent task success/failure creates workspace notification.
- Preview failure creates workspace warning.
- Download export creates download-ready notification.

