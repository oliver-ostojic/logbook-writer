"""Reproducibility check for CP-SAT solver + tuning.

Goal:
- Verify that with a fixed random_seed (and deterministic model construction),
  repeated solves on the SAME payload + weights produce the same assignments.

Usage (from apps/solver-python):
  ./venv/bin/python reproducibility_check.py --store 768 --date 2025-11-25 --runs 5 --seed 42

Notes:
- This script fetches once and caches to cached_solver_input.json by default.
- It compares assignments exactly (after sorting for stable ordering).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from typing import Any, Dict, List, Tuple

sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import vectorize_satisfaction

DEFAULT_API_BASE = "http://localhost:4000"
DEFAULT_CACHE = "cached_solver_input.json"


def fetch_solver_input(api_base: str, store_id: str, date: str) -> Dict[str, Any]:
    url = f"{api_base}/solver/v2/input?storeId={store_id}&date={date}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode())
    if not result.get("success"):
        raise RuntimeError(result.get("error") or "API returned success=false")
    return result["data"]


def load_or_fetch_payload(*, api_base: str, store_id: str, date: str, cache_path: str) -> Dict[str, Any]:
    if os.path.exists(cache_path):
        print(f"📂 Loading cached solver input from: {cache_path}")
        with open(cache_path, "r") as f:
            return json.load(f)

    print(f"🔍 Fetching solver input from: {api_base}/solver/v2/input?storeId={store_id}&date={date}")
    payload = fetch_solver_input(api_base, store_id, date)
    with open(cache_path, "w") as f:
        json.dump(payload, f)
    print(f"💾 Cached solver input to: {cache_path}")
    return payload


def assignment_signature(assignments: List[Dict[str, Any]]) -> List[Tuple[Any, ...]]:
    """Stable representation for exact comparison."""
    sig = [
        (
            a.get("crewId"),
            a.get("roleId"),
            a.get("slotIndex"),
            a.get("startMinute"),
            a.get("endMinute"),
            a.get("durationMin"),
        )
        for a in assignments
    ]
    sig.sort()
    return sig


def main() -> int:
    # Ensure Python hash iteration order is stable. This matters if any part of
    # the model construction iterates over sets/dicts that depend on hash order.
    # Re-execing is the only reliable way to enforce this.
    if os.environ.get("PYTHONHASHSEED") not in ("0", 0):
        env = dict(os.environ)
        env["PYTHONHASHSEED"] = "0"
        print("🔁 Re-exec with PYTHONHASHSEED=0 for deterministic hashing")
        return subprocess.call([sys.executable, *sys.argv], env=env)

    parser = argparse.ArgumentParser()
    parser.add_argument("--store", default="768")
    parser.add_argument("--date", default="2025-11-25")
    parser.add_argument("--api", default=DEFAULT_API_BASE)
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--time-limit", type=int, default=10)
    args = parser.parse_args()

    payload = load_or_fetch_payload(
        api_base=args.api, store_id=args.store, date=args.date, cache_path=args.cache
    )

    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    weights = {rule.get("id", i): 1.0 for i, rule in enumerate(crew_rules)}

    print(f"🎲 Seed: {args.seed} | Runs: {args.runs}")

    sig0 = None
    sat0 = None

    for i in range(args.runs):
        result = solve(
            payload,
            time_limit_seconds=args.time_limit,
            weights=weights,
            random_seed=args.seed,
        )
        if not result.get("success"):
            print(f"❌ Solve failed on run {i}: {result.get('metadata', {}).get('status')}")
            return 2

        assignments = result.get("assignments", [])
        sig = assignment_signature(assignments)

        crew = payload.get("crew", [])
        sat = vectorize_satisfaction(assignments, crew_rules, crew)
        eligible = sum(1 for s in sat if s >= 0)
        satisfied = sum(1 for s in sat if s == 1)

        print(f"Run {i+1}: {len(assignments)} assignments | satisfied {satisfied}/{eligible}")

        if sig0 is None:
            sig0 = sig
            sat0 = (satisfied, eligible)
        else:
            same = sig == sig0
            print(f"        identical_to_run1: {same}")
            if not same:
                print("\n⚠️  Not deterministic yet: assignments differ even with same seed.")
                print(f"Run1 satisfied: {sat0[0]}/{sat0[1]}")
                print(f"Run{i+1} satisfied: {satisfied}/{eligible}")
                return 1

    print("\n✅ Deterministic across runs (same seed + same payload + same weights)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
