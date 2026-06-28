# Live Editor Streaming Report

Date: 2026-06-28

## What Was Broken

- Files appeared after generation instead of feeling like active editing.
- The editor did not receive explicit active-file and save-state events.

## What Changed

- Backend emits:
  - `activeFile`
  - `editorOpenFile`
  - `editorApplyChunk`
  - `editorSaveState`
  - `file_progress`
- Frontend reacts by:
  - opening the file tab
  - switching to code mode
  - setting live file status
  - appending real streamed chunks from `file_write_chunk`
  - showing writing percentages from `file_progress`
  - marking files as saving/saved

## Important Detail

`editorApplyChunk` is treated as a UI coordination event. The actual content append still uses the existing `file_write_chunk` event to avoid duplicate code in the editor.

## Verification

- Lint passed.
- Build passed.
