# Meldex MiniMax-H3 worker

Pinned runtime:

- Model: `MiniMaxAI/MiniMax-H3`
- Model revision: `fa9c8ab1eaa21c8ae25e7e40b83b2e6002f340af`
- vLLM-Omni commit: `ae7bee0c43c780a8e21d0b5e4b92a7eaeaea8783`
- Base: `vllm/vllm-openai:v0.26.0`

One container loads one partition. The default is `FL2VA`; use `H3_PARTITION=Ref2VA` for reference-conditioned jobs. Both partitions are never loaded together by default. Ports bind to loopback and must be reached through the Meldex authenticated tunnel/proxy.

The snapshot is approximately 354 GB. Download it to persistent storage before renting generation compute, validate both partition indexes, then mount it read-only through `H3_MODEL_HOST_ROOT`.

