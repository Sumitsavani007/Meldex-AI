import json
import os
from pathlib import Path

root = Path(os.environ.get("H3_MODEL_ROOT", "/models/MiniMax-H3"))
partition = os.environ.get("H3_PARTITION", "FL2VA")
if partition not in {"FL2VA", "Ref2VA"}:
    raise SystemExit("Invalid H3_PARTITION")
required = [root / "FL2VA" / "model_index.json", root / "Ref2VA" / "model_index.json", root / partition / "transformer"]
missing = [str(item) for item in required if not item.exists()]
if missing:
    raise SystemExit("Incomplete MiniMax-H3 snapshot: " + ", ".join(missing))
print(json.dumps({"model_root": str(root), "partition": partition, "validated": True}))

