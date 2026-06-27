# Model Usage Config Report

Date: 2026-06-27

## Database

Added Prisma model `ModelUsageConfig` with editable model pricing fields:

- provider
- model
- input/output/reasoning/cached multipliers
- tool call cost
- preview cost
- file read/write cost
- memory read/write cost
- fallback estimate credits
- retry multiplier
- autofix multiplier
- active flag

## Seeded Default

Seeded OpenRouter Qwen3-Coder:

- provider: `openrouter`
- model: `qwen/qwen3-coder-30b-a3b-instruct`
- input multiplier: `1`
- output multiplier: `2`
- reasoning multiplier: `3`
- cached multiplier: `0.25`
- tool call cost: `1`
- preview cost: `2`
- file read cost: `0.2`
- file write cost: `1`
- memory read cost: `0.2`
- memory write cost: `0.5`
- retry multiplier: `1.25`
- autofix multiplier: `1.5`

## Master Panel

Added Master -> Usage Pricing:

- list configs
- edit multipliers
- edit tool/preview/file/memory costs
- edit retry/autofix multipliers
- reset defaults
- create new model pricing config

## Verification

Local DB smoke test confirmed the OpenRouter Qwen config is active.
