ARG VLLM_BASE_IMAGE=nvcr.io/nvidia/pytorch@sha256:b6103eae207f71b7cc81b384695abf0b8648fd9790d83050f2146d66c23682e0
FROM ${VLLM_BASE_IMAGE}

ARG VLLM_OMNI_COMMIT=ae7bee0c43c780a8e21d0b5e4b92a7eaeaea8783
ENV PYTHONUNBUFFERED=1 H3_MODEL_ROOT=/models/MiniMax-H3 H3_PARTITION=FL2VA H3_FL2VA_PORT=8091 H3_REF2VA_PORT=8092 VLLM_OMNI_VIDEO_SYNC_TIMEOUT=1800 VLLM_WORKER_MULTIPROC_METHOD=spawn

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git jq curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --break-system-packages --no-cache-dir uv==0.8.9 \
 && git clone https://github.com/vllm-project/vllm-omni.git /opt/vllm-omni \
 && git -C /opt/vllm-omni checkout "${VLLM_OMNI_COMMIT}" \
 && uv venv /opt/meldex/venv --python python3 \
 && uv pip install --python /opt/meldex/venv/bin/python --no-cache-dir -e /opt/vllm-omni

COPY entrypoint.sh /opt/meldex/entrypoint.sh
COPY healthcheck.py /opt/meldex/healthcheck.py
COPY scripts/validate-model.py /opt/meldex/validate-model.py
RUN chmod 0755 /opt/meldex/entrypoint.sh
HEALTHCHECK --interval=30s --timeout=10s --start-period=30m --retries=5 CMD ["python3", "/opt/meldex/healthcheck.py"]
ENV PATH=/opt/meldex/venv/bin:$PATH
ENTRYPOINT ["/opt/meldex/entrypoint.sh"]
