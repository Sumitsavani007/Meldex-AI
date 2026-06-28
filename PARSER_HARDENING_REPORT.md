# Parser Hardening Report

Date: 2026-06-28

## Issue

Model output could be valid content but not strict JSON, causing CSS/JS to be missed or saved blank.

## Fix

Parser now handles:

- JSON file arrays
- markdown code blocks
- loose `index.html`, `style.css`, `script.js` sections
- inline `<style>` extraction into `style.css`
- inline `<script>` extraction into `script.js`

## Safety

- Raw model dumps are rejected.
- Unresolved template placeholders are rejected.
- Too-short static files trigger deterministic repair.

## Verification

- Build passed after parser changes.
