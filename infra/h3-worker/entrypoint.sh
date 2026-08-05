#!/usr/bin/env bash
set -euo pipefail
python3 /opt/meldex/validate-model.py

case "${H3_PARTITION:-FL2VA}" in
  FL2VA) h3_port="${H3_FL2VA_PORT:-8091}" ;;
  Ref2VA) h3_port="${H3_REF2VA_PORT:-8092}" ;;
  *) echo "H3_PARTITION must be FL2VA or Ref2VA" >&2; exit 64 ;;
esac

h3_model="${H3_MODEL_ROOT:-/models/MiniMax-H3}/${H3_PARTITION}"
h3_args=(serve "$h3_model" --omni --host 0.0.0.0 --port "$h3_port" --trust-remote-code --num-gpus "${H3_NUM_GPUS:-1}" --diffusion-attention-backend FLASH_ATTN)
if [[ "${H3_NUM_GPUS:-1}" == "1" && "${H3_ENABLE_CPU_OFFLOAD:-true}" == "true" ]]; then h3_args+=(--enable-cpu-offload); fi
if [[ "${H3_ENABLE_FP8:-false}" == "true" ]]; then h3_args+=(--quantization fp8); fi
if [[ "${H3_NUM_GPUS:-1}" == "4" ]]; then h3_args+=(--usp 4 --ring 1 --text-encoder-tp-size 4 --vae-patch-parallel-size 4 --vae-parallel-mode tile --vae-use-tiling); fi

export H3_ACTIVE_PORT="$h3_port"
export VLLM_OMNI_SERVER_STORAGE__PATH="${VLLM_OMNI_SERVER_STORAGE__PATH:-/var/tmp/vllm-omni-videos}"
exec vllm "${h3_args[@]}"

