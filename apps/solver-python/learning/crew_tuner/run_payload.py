"""CLI helper: print crew-tuner overrides for a solver payload JSON file.

Usage:
  python -m learning.crew_tuner.run_payload --payload path/to/solver_input.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from .tuner import compute_weight_overrides


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True)
    args = parser.parse_args(argv)

    payload_path = Path(args.payload)
    payload: Dict[str, Any] = json.loads(payload_path.read_text())

    overrides = compute_weight_overrides(payload)
    print(json.dumps(overrides, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
