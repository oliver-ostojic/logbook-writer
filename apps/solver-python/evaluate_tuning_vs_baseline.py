"""Evaluate whether tuning beats baseline across many solver seeds.

This answers: "Does tuning actually help, or are improvements just solver randomness?"

Approach
- For each seed:
    1) Baseline solve with weights=1.0 for crew rules
    2) Run tuning loop (conflict-aware) where EVERY solver call uses the same seed
    3) Take the BEST iteration from tuning (driver already returns best weights)
    4) Re-solve with best weights (same seed) to compute final tuned satisfaction

We report per-seed deltas and aggregate stats.

Usage (from apps/solver-python):
  ./venv/bin/python evaluate_tuning_vs_baseline.py --store 768 --date 2025-11-25 --seeds 20

Notes
- We fetch once and cache to cached_solver_input.json by default.
- If the solver isn't fully deterministic even with seed, this still gives a fair
  "apples-to-apples" comparison per seed.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import sys
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence, Tuple

sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop, vectorize_satisfaction

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


def satisfaction_counts(assignments: List[Dict[str, Any]], crew_rules: List[Dict[str, Any]], crew: List[Dict[str, Any]]) -> Tuple[int, int]:
    sat = vectorize_satisfaction(assignments, crew_rules, crew)
    eligible = sum(1 for s in sat if s >= 0)
    satisfied = sum(1 for s in sat if s == 1)
    return satisfied, eligible


@dataclass(frozen=True)
class SeedResult:
    seed: int
    baseline_satisfied: int
    baseline_eligible: int
    tuned_satisfied: int
    tuned_eligible: int
    tuned_best_iteration: int

    @property
    def delta(self) -> int:
        # eligible can fluctuate; delta in satisfied still the most actionable
        return self.tuned_satisfied - self.baseline_satisfied


def make_seeds(count: int, *, base_seed: int | None = None) -> List[int]:
    if base_seed is not None:
        rng = random.Random(base_seed)
        return [rng.randint(1, 1_000_000_000) for _ in range(count)]
    # Simple deterministic list if not specified
    return list(range(1, count + 1))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", default="768")
    parser.add_argument("--date", default="2025-11-25")
    parser.add_argument("--api", default=DEFAULT_API_BASE)
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--seeds", type=int, default=5, help="Number of seeds to evaluate")
    parser.add_argument("--seed-list", default="", help="Comma-separated explicit seeds")
    parser.add_argument("--seed-gen", type=int, default=12345, help="Seed used to generate the seed list")
    parser.add_argument("--time-limit", type=int, default=3)
    parser.add_argument("--max-iters", type=int, default=6)
    parser.add_argument("--min-iters", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=0.15)
    parser.add_argument("--use-conflicts", action="store_true", default=True)
    parser.add_argument(
        "--max-total-solves",
        type=int,
        default=40,
        help="Hard cap on total solver() calls across all seeds (keeps runs snappy).",
    )
    args = parser.parse_args()

    payload = load_or_fetch_payload(
        api_base=args.api, store_id=args.store, date=args.date, cache_path=args.cache
    )

    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    crew = payload.get("crew", [])

    if args.seed_list.strip():
        seeds = [int(s.strip()) for s in args.seed_list.split(",") if s.strip()]
    else:
        seeds = make_seeds(args.seeds, base_seed=args.seed_gen)

    print(f"\nEvaluating {len(seeds)} seeds")
    print(f"Store: {args.store} | Date: {args.date}")
    print(f"TimeLimit: {args.time_limit}s | MaxIters: {args.max_iters} | LearningRate: {args.learning_rate}")

    results: List[SeedResult] = []
    total_solves = 0

    for idx, seed in enumerate(seeds, start=1):
        if total_solves >= args.max_total_solves:
            print(f"\n⏹️  Stopping early: hit max_total_solves={args.max_total_solves}")
            break
        print(f"\n[{idx}/{len(seeds)}] Seed {seed}")

        baseline_weights = {rule.get("id", i): 1.0 for i, rule in enumerate(crew_rules)}
        baseline = solve(
            payload,
            time_limit_seconds=args.time_limit,
            weights=baseline_weights,
            random_seed=seed,
        )
        total_solves += 1
        if not baseline.get("success"):
            print(f"  ❌ Baseline solve failed: {baseline.get('metadata', {}).get('status')}")
            continue

        baseline_assignments = baseline.get("assignments", [])
        b_sat, b_elig = satisfaction_counts(baseline_assignments, crew_rules, crew)
        print(f"  Baseline: {b_sat}/{b_elig} satisfied")

        # Tuning loop uses a solver_fn(payload, weights) signature.
        def solver_fn(p: Dict[str, Any], w: Dict[int, float]) -> Dict[str, Any]:
            nonlocal total_solves
            if total_solves >= args.max_total_solves:
                # Signal failure so the tuner can stop; we'll summarize what we have.
                return {"success": False, "metadata": {"status": "MAX_TOTAL_SOLVES"}, "assignments": []}
            total_solves += 1
            return solve(p, time_limit_seconds=args.time_limit, weights=w, random_seed=seed)

        tuned_state = run_tuning_loop(
            payload,
            solver_fn,
            max_iterations=args.max_iters,
            min_iterations=args.min_iters,
            min_improvement=0.001,
            use_conflict_resolution=args.use_conflicts,
            learning_rate=args.learning_rate,
        )

        if total_solves >= args.max_total_solves:
            print(f"  ⏹️  Hit max_total_solves={args.max_total_solves} during tuning; stopping evaluation.")
            break

        best_iter = int(tuned_state.get("best_iteration", 0))
        tuned_weights = tuned_state.get("weights", {})

        tuned = solve(
            payload,
            time_limit_seconds=args.time_limit,
            weights=tuned_weights,
            random_seed=seed,
        )
        total_solves += 1
        if not tuned.get("success"):
            print(f"  ❌ Tuned solve failed: {tuned.get('metadata', {}).get('status')}")
            continue

        tuned_assignments = tuned.get("assignments", [])
        t_sat, t_elig = satisfaction_counts(tuned_assignments, crew_rules, crew)
        delta = t_sat - b_sat

        print(f"  Tuned(best@iter {best_iter}): {t_sat}/{t_elig} satisfied | Δ={delta:+d}")

        results.append(
            SeedResult(
                seed=seed,
                baseline_satisfied=b_sat,
                baseline_eligible=b_elig,
                tuned_satisfied=t_sat,
                tuned_eligible=t_elig,
                tuned_best_iteration=best_iter,
            )
        )

    if not results:
        print("\n❌ No successful runs to summarize")
        return 2

    deltas = [r.delta for r in results]
    improved = sum(1 for d in deltas if d > 0)
    tied = sum(1 for d in deltas if d == 0)
    worse = sum(1 for d in deltas if d < 0)

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Seeds evaluated: {len(results)}")
    print(f"Improved: {improved} | Same: {tied} | Worse: {worse}")
    print(f"Mean Δ satisfied: {statistics.mean(deltas):+.2f}")
    if len(deltas) >= 2:
        print(f"Stddev Δ: {statistics.pstdev(deltas):.2f}")
    print(f"Min/Max Δ: {min(deltas):+d} / {max(deltas):+d}")

    # Show top/bottom seeds for quick inspection
    best = sorted(results, key=lambda r: r.delta, reverse=True)[:5]
    worst_list = sorted(results, key=lambda r: r.delta)[:5]

    print("\nTop 5 improvements:")
    for r in best:
        print(f"  seed={r.seed}  baseline={r.baseline_satisfied}/{r.baseline_eligible}  tuned={r.tuned_satisfied}/{r.tuned_eligible}  Δ={r.delta:+d}")

    print("\nBottom 5 regressions:")
    for r in worst_list:
        print(f"  seed={r.seed}  baseline={r.baseline_satisfied}/{r.baseline_eligible}  tuned={r.tuned_satisfied}/{r.tuned_eligible}  Δ={r.delta:+d}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
