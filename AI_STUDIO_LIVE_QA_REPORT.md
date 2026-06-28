# AI Studio Live QA Report

Date: 2026-06-28

## Local QA

- `npm run lint` passed with existing Workspace hook warnings.
- `npm run build` passed.
- Studio routes compiled:
  - `/studio`
  - `/api/studio/projects`
  - `/api/studio/projects/[id]`
  - `/api/studio/generate`
  - `/api/studio/scenes/[id]/update`
  - `/api/studio/provider/status`

## QA Coverage

- Project CRUD implemented.
- Settings persistence implemented.
- OpenRouter storyboard stream implemented.
- Provider status honesty implemented.
- Storyboard/timeline persistence implemented.

## Live Authenticated QA

- Created a live credentials QA session.
- Created AI Studio project: `Gujarati Rain QA`.
- Provider status endpoint returned:
  - OpenRouter: `connected`
  - ComfyUI/Wan 2.1/FLUX/SDXL/XTTS/FFmpeg: `not_configured`
- Ran Gujarati prompt:

`એક છોકરો વરસાદમાં ગામની ગલીમાં દોડે છે અને છેલ્લે સૂર્ય નીકળે છે, cinematic video બનાવો.`

Result:

- Stream completed with `done`.
- Language detected: `Gujarati`.
- Generation status: `COMPLETED`.
- Scenes generated: `2`.
- Enhanced prompt persisted: yes.
- Local provider warning shown honestly through provider status event.
- Settings persistence verified: `720p`, `9:16`, `30fps`, `Anime`.
- Scene update persistence verified: duration `5`, camera `Orbit`, prompt updated.

## Remaining V1 Boundary

Real video rendering awaits local provider configuration.
