# Semantic File Ranking Report

Date: 2026-06-28

## Implemented

- Files are ranked using prompt tokens, active file, recent files, path hits, content hits, canonical files, file kind, and graph connectivity.
- Top ranked files are used for context packing and Qwen prompt construction.

## Event

- `file_ranking_done`

## Validation

- Test prompt `Change the pricing button text in index.html only` ranked `index.html` first.

