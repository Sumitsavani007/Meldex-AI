# Usage Recording Report

Date: 2026-06-27

## Recording Points

Usage is recorded after successful Workspace agent completion in:

- `app/api/workspaces/[id]/agent/stream/route.ts`
- `app/api/workspaces/[id]/agent/route.ts`

## Recorded Metadata

Each `CreditTransaction` includes:

- provider
- model
- workspace/project id
- task id
- prompt length
- context tokens
- input tokens
- output tokens
- reasoning tokens
- cached tokens
- estimated flag
- files changed
- file reads/writes
- tool calls
- retries
- autofixes
- preview runs
- preview verification result
- calculator breakdown

## Usage Windows

The engine updates:

- 5-hour window
- weekly window
- monthly window

## User History

Added `Settings -> Usage` with:

- current window usage
- transaction history
- model/task metadata
- CSV export at `/api/usage?format=csv`

## Master History

Master user detail now shows recent usage transactions, grants, resets, adjustments, and high usage spikes.
