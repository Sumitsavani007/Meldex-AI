# In-App Alerts Report

Date: 2026-06-27

## Summary

Added real DB-backed in-app notifications for user panel pages.

## User UI

Added notification bell with:

- unread count
- notification dropdown
- severity labels
- empty state
- mark one as read
- mark all read
- action links

Added notification preferences page:

- `/settings/notifications`

User can control in-app and email settings by notification type. Security-critical notifications remain locked on.

## APIs

- `GET /api/notifications`
- `PATCH /api/notifications`
- `POST /api/notifications`
- `GET /api/notifications/preferences`
- `PATCH /api/notifications/preferences`

All routes require authentication.

