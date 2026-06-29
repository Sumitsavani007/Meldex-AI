# Hardware Report

Date: 2026-06-29

## Machine

- Mac: Apple M3 MacBook Air class hardware
- Unified memory: 8GB
- Metal/MPS: available

## Engineering Decision

FLUX should not run on this Mac right now.

Reason:

- 8GB unified memory is too tight for local FLUX generation.
- Previous FLUX attempts stalled and risked system instability.

## Active Low-Memory Target

SDXL Turbo low-memory mode:

- 320x320
- batch 1
- 1 step

This is the safest current local target.
