# Workspace Speed Benchmark Report

Date: 2026-06-28

## Added Runtime Timing

The workspace stream now records and emits:

- task creation time
- snapshot creation time
- workspace read time
- model response time
- parser time
- per-file write time
- preview verification time
- total task time

The final stream includes a `speed_benchmark` event with the timing payload.

## Realtime Behavior

- First events are emitted before model generation.
- Heartbeat events fire every 2 seconds during model wait and repair wait.
- Files are still applied progressively with chunk events.
- Explorer/editor events fire per file.

## Verification

- `npm run lint` passed with existing warnings.
- `npx prisma generate` passed.
- `npm run build` passed.
- AWS migration deploy passed after sourcing `.env.local`.
- AWS build passed and PM2 restarted.
- Deployed commit: `2f64184810f766e0d185a43ffb1c34365432dbef`.

## Live Benchmark Note

The BookNest authenticated browser task should be rerun after deployment to capture production timing values from the emitted `speed_benchmark` event.
