# Video Length Report

Date: 2026-06-30

## What Was Built

- AI Studio video duration now uses a clean selector:
  - 5 sec
  - 8 sec
  - 10 sec
  - 15 sec
  - 20 sec
  - 30 sec
  - 60 sec
- Credit estimation updates when duration changes.
- Video credit cost includes duration, resolution, FPS, aspect ratio, reference/input complexity, future upscaling, and future audio flags.
- Video render requests are blocked before provider execution when the user does not have enough credits.

## Files Changed

- `app/studio/page.tsx`
- `app/api/studio/render/route.ts`
- `lib/plans-credits.ts`

## Verification

- TypeScript and production build passed.
- Render route now returns structured insufficient-credit responses with credit estimate and current balance.

## Remaining Notes

- Real Wan/Comfy Cloud video generation still requires valid Comfy Cloud video workflow configuration.
