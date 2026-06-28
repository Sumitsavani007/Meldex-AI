# AI Studio Working Features Report

Date: 2026-06-29

## Working UI Controls

- Project create, rename, duplicate, delete, search, and selection.
- Avatar selection, avatar upload, avatar remove, and avatar preview.
- Prompt typing, auto-size textarea, character count, clear, example prompt, and prompt history.
- Style selector.
- Generate Script button connected to `POST /api/studio/generate`.
- Scene edit, duplicate, delete, and duration increment.
- Copy enhanced prompt and export JSON.
- Quick Add frame, clip, and audio upload with preview/remove.
- Video reference card with uploaded frame/clip or selected avatar fallback.

## Persistence

- Generation settings continue to persist through `PATCH /api/studio/projects/[id]`.
- Uploaded avatar/frame/clip/audio metadata and data URLs are saved in project settings JSON for restore after refresh.
- Prompt history is stored locally for quick reuse.

## Current Honest Limitation

- Studio does not fake final video rendering. When local video providers are not configured, the UI shows storyboard/prompt output and the provider-not-configured message.

