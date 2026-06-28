# Patch Output Contract Report

Date: 2026-06-28

## Contract

Small edit prompts now ask Qwen to return patches only:

```json
{
  "patches": [
    {
      "path": "style.css",
      "find": "exact existing snippet",
      "replace": "new snippet",
      "description": "brief"
    }
  ],
  "summary": "short summary",
  "warnings": []
}
```

## Token Budgets

- Style-only patch: `650` max tokens, target range `400-800`.
- Small HTML/JS patch: `900` max tokens, target range `600-1200`.

## File Targeting

- Headline/text/FAQ edits target `index.html`.
- Color/spacing/theme/style edits target `style.css`.
- Patch mode does not send broad workspace memory or unrelated files.

## No Whole Regeneration

Live QA confirmed these edits saved one targeted file each:

- Headline: `index.html`
- Primary color: `style.css`
- FAQ item: `index.html`
- Card spacing: `style.css`

