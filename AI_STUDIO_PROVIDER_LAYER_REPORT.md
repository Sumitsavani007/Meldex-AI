# AI Studio Provider Layer Report

Date: 2026-06-29

## Provider Behavior

- OpenRouter remains the story/script/prompt brain through the existing `enhanceStudioPrompt` flow.
- Local video providers are not faked.
- The UI surfaces local provider state with the message: `Local video provider not configured. Storyboard and prompts are ready.`

## Future-Ready UI

- The settings panel now has video-generation controls ready for future local providers:
  - resolution
  - FPS
  - aspect ratio
  - duration
  - camera motion
  - motion strength
  - consistency
  - reference uploads

