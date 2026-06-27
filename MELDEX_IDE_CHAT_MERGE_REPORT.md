# Meldex IDE Chat Merge Report

Date: 2026-06-27

## What Was Broken

- Meldex AI was presented as a secondary side panel instead of the primary agent/chat experience.
- The chat tab still looked like raw event cards rather than a Codex-style agent panel.

## What Changed

- Meldex AI panel now opens by default for IDE sessions.
- The main chat tab label is `Meldex AI`.
- The panel continues to call the real workspace backend stream endpoint:
  `/api/workspaces/[id]/agent/stream`
- Stop, retry, send, attach-context disabled state, preview open/copy, activity, and file copy controls are all explicit.

## Files Changed

- `app/workspace/[projectId]/ide/ide-frame-client.tsx`

## Verification

- Local build/type validation passed.
- Live authenticated IDE route source contains `Meldex AI` and `Meldex IDE`.
- Live authenticated IDE route source contains no forbidden upstream product/setup/chat labels.
- Real stream endpoint smoke test returned `39` events and completed with `done: Task complete`.
- Stream event types included memory, intent, classifier, planner, architect, designer, tool plan, confidence, Qwen generation, file extraction, reviewer, security, performance, preview, finalizer, memory, and learning events.

## Remaining Issues

- Native upstream workbench internals still exist under the runtime base, but user-facing Meldex shell and patched workbench sources no longer expose the forbidden labels in verified routes.
