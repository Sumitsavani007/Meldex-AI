# Credit Engine Report

Date: 2026-06-30

## What Was Built

- Added one centralized AI Studio credit estimator in `lib/plans-credits.ts`.
- Added dynamic model cost seeding for `comfy_cloud` image and video models through `ModelUsageConfig`.
- Added `/api/studio/credits/estimate` for live credit preview before generation.
- Image and video generation now run a credit pre-check before provider execution.
- Successful generations create `CreditTransaction` usage records and update usage windows.
- Monthly credits are consumed first; purchased/bonus credits are consumed second.

## Files Changed

- `lib/plans-credits.ts`
- `app/api/studio/credits/estimate/route.ts`
- `app/api/studio/image/generate/route.ts`
- `app/api/studio/render/route.ts`
- `app/api/usage/route.ts`
- `app/dashboard/page.tsx`
- `app/studio/page.tsx`
- `app/api/admin/usage-pricing/route.ts`

## Verification

- `npm run lint` passed with existing workspace hook warnings only.
- `npx tsc --noEmit` passed.
- `npx prisma generate` passed.
- `npx prisma migrate deploy` passed with no pending migrations.
- `npm run build` passed.

## Remaining Notes

- Real image/video provider execution still depends on valid Comfy Cloud workflow configuration and API credentials in the runtime environment.
