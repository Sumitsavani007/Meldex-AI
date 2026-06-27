# Meldex AI Panel Report

Date: 2026-06-27

## Current State

The current Meldex AI panel remains in the Meldex Workspace UI and uses the existing backend:

- `/api/workspaces/[id]/agent/stream`
- workspace memory
- preview APIs
- file APIs
- Qwen/OpenRouter orchestration

## OpenVSCode Integration Plan

The AI panel should be added as a VS Code/OpenVSCode extension, not by patching random OpenVSCode UI internals.

Required extension capabilities:

- Webview sidebar panel.
- Authenticated calls back to Meldex workspace APIs.
- Agent stream timeline.
- Changed files/diffs.
- Preview actions.
- Download ZIP command.

## Status

Blocked until OpenVSCode runtime and extension packaging/deployment are available.

