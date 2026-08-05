import json
import os
import urllib.request

port = os.environ.get("H3_ACTIVE_PORT") or (os.environ.get("H3_REF2VA_PORT", "8092") if os.environ.get("H3_PARTITION") == "Ref2VA" else os.environ.get("H3_FL2VA_PORT", "8091"))
for endpoint in ("/health", "/v1/models"):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}{endpoint}", timeout=8) as response:
        if response.status != 200:
            raise SystemExit(1)
print(json.dumps({"status": "healthy", "partition": os.environ.get("H3_PARTITION", "FL2VA")}))

