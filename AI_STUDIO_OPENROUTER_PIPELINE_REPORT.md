# AI Studio OpenRouter Pipeline Report

Date: 2026-06-28

## Pipeline

OpenRouter is used for:

- Native language understanding
- Gujarati/Hindi/English/mixed language detection
- Cinematic prompt enhancement
- Story/script generation
- Scene splitting
- Shot planning
- Negative prompt generation
- Timeline metadata

## Streaming Events

The Studio stream emits:

- request received
- detecting language
- enhancing prompt
- writing story
- splitting scenes
- creating storyboard
- building timeline
- checking local providers
- preview storyboard ready
- completed

## Honesty

No fake video render is shown. If local video providers are not configured, Studio shows the storyboard plan and next action.

## Live Result

Authenticated live Gujarati prompt completed through OpenRouter with model `qwen/qwen3-coder-30b-a3b-instruct`, generated 2 scenes, detected Gujarati, and persisted storyboard data.
