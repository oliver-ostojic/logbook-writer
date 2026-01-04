"""Compare CP-SAT Portfolio search vs seeded single-worker search.

This script measures two modes:
A) Seeded mode: random_seed set -> force 1 worker (more reproducible-ish)
B) Portfolio mode: no seed -> use all CPU cores (portfolio search)

Then it can optionally run tuning under portfolio mode to see whether tuning
still yields an advantage, even in a noisier setting.

Usage (from apps/solver-python):
  ./venv/bin/python analyze_portfolio_vs_seeded.py --store 768 --date 2025-11-25 --trials 5 --time-limit 3

Optional:
  ./venv/bin/python analyze_portfolio_vs_seeded.py --tune-portfolio

Notes:
- Fetches input once and caches to cached_solver_input.json by default.
- Uses crew-rule satisfaction (eligible only) as the primary metric.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import sys
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop
from tuning_engine.metrics import satisfaction_counts, per_crew_satisfaction, fairness_stats
from tuning_engine.parallel_search import run_parallel_regions
from tuning_engine.data_recorder import DataRecorder
from learning.oracle import NearestNeighborOracle

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

def debug_payload(payload: Dict[str, Any]) -> None:
    print(f"DEBUG: Payload keys: {list(payload.keys())}")
    print(f"DEBUG: RoleRules count: {len(payload.get('roleRules', []))}")
    print(f"DEBUG: Crew count: {len(payload.get('crew', []))}")
    print(f"DEBUG: Roles count: {len(payload.get('roles', []))}")


@dataclass(frozen=True)
class TrialResult:
    label: str
    satisfied: int
    eligible: int
    seconds: float
    min_pct: float = 0.0  # Lowest crew satisfaction %
    max_pct: float = 0.0  # Highest crew satisfaction %
    spread: float = 0.0   # max - min (fairness gap)
    fairness_index: float = 100.0  # 100 = perfect equality, 0 = max inequality


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", default="768")
    parser.add_argument("--date", default="2025-11-25")
    parser.add_argument("--api", default=DEFAULT_API_BASE)
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--trials", type=int, default=5)
    parser.add_argument("--time-limit", type=int, default=3)
    parser.add_argument("--portfolio-workers", type=int, default=0, help="0 = all cores")
    parser.add_argument("--seed-base", type=int, default=12345)
    parser.add_argument("--tune-portfolio", action="store_true", default=False)
    parser.add_argument("--tune-iters", type=int, default=6)
    parser.add_argument("--tune-min-iters", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=0.15)
    parser.add_argument("--use-annealing", action="store_true", default=False, help="Enable simulated annealing in tuner")
    parser.add_argument("--use-locking", action="store_true", default=False, help="Enable lock detection for unsat rules")
    parser.add_argument("--use-fairness", action="store_true", default=False, help="Enable fairness-weighted tuning (Module 3)")
    parser.add_argument("--use-volatility-rejection", action="store_true", default=False, help="Enable volatility rejection (Module 2.2)")
    parser.add_argument("--final-shots", type=int, default=1, help="Number of final solves with tuned weights (pick best)")
    parser.add_argument("--parallel-regions", type=int, default=0, help="Number of parallel regions to search (0 = disabled)")
    parser.add_argument("--shots-per-region", type=int, default=3, help="Number of ladder shots per region")
    parser.add_argument("--record-data", action="store_true", default=False, help="Record successful runs to training dataset")
    parser.add_argument("--use-oracle", action="store_true", default=False, help="Use Nearest Neighbor Oracle to warm-start weights")
    parser.add_argument("--skip-seeded", action="store_true", default=False, help="Skip seeded mode trials")
    args = parser.parse_args()

    payload = load_or_fetch_payload(
        api_base=args.api,
        store_id=args.store,
        date=args.date,
        cache_path=args.cache
    )
    debug_payload(payload)

    recorder = DataRecorder() if args.record_data else None
    oracle = NearestNeighborOracle() if args.use_oracle else None

    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    # Fallback: if no source field, use all rules (backwards compatibility)
    if not crew_rules:
        crew_rules = all_rules
    crew = payload.get("crew", [])
    weights_1 = {rule.get("id", i): 1.0 for i, rule in enumerate(crew_rules)}

    rng = random.Random(args.seed_base)
    seeds = [rng.randint(1, 1_000_000_000) for _ in range(args.trials)]

    print("\nComparing modes")
    print(f"Trials: {args.trials} | time_limit={args.time_limit}s")
    print(f"Portfolio workers: {args.portfolio_workers or (os.cpu_count() or 1)}")

    seeded_results: List[TrialResult] = []
    portfolio_results: List[TrialResult] = []
    tuned_portfolio_results: List[TrialResult] = []

    for i, seed in enumerate(seeds, start=1):
        print(f"\nTrial {i}/{len(seeds)}")

    # A) seeded + single-worker (best-effort reproducibility)
    # NOTE: in this OR-Tools build, random_seed + multi-worker can yield MODEL_INVALID.
        if not args.skip_seeded:
            t0 = time.perf_counter()
            res_seeded = solve(
                payload,
                time_limit_seconds=args.time_limit,
                weights=weights_1,
                random_seed=seed,
                num_workers=1,
            )
            dt = time.perf_counter() - t0
            if not res_seeded.get("success"):
                print(f"  Seeded failed: {res_seeded.get('metadata', {}).get('status')}")
            else:
                s, e = satisfaction_counts(res_seeded.get("assignments", []), crew_rules, crew)
                seeded_results.append(TrialResult("seeded", s, e, dt))
                print(f"  Seeded:    {s}/{e} in {dt:.2f}s")

    # B) portfolio (multi-worker, no seed)
        t0 = time.perf_counter()
        res_port = solve(
            payload,
            time_limit_seconds=args.time_limit,
            weights=weights_1,
            random_seed=None,
            num_workers=args.portfolio_workers,
        )
        dt = time.perf_counter() - t0
        if not res_port.get("success"):
            print(f"  Portfolio failed: {res_port.get('metadata', {}).get('status')}")
            continue

        s, e = satisfaction_counts(res_port.get("assignments", []), crew_rules, crew)
        pc = per_crew_satisfaction(res_port.get("assignments", []), crew_rules, crew)
        min_pct, max_pct, spread, fair_idx = fairness_stats(pc)
        portfolio_results.append(TrialResult("portfolio", s, e, dt, min_pct, max_pct, spread, fair_idx))
        print(f"  Portfolio: {s}/{e} in {dt:.2f}s | fairness idx: {fair_idx:.1f} (spread {spread:.0f}%)")

        if args.tune_portfolio:
            # Tune using portfolio solver_fn
            def solver_fn(p: Dict[str, Any], w: Dict[int, float]) -> Dict[str, Any]:
                return solve(
                    p,
                    time_limit_seconds=args.time_limit,
                    weights=w,
                    random_seed=None,
                    num_workers=args.portfolio_workers,
                )

            # Get initial weights from Oracle if enabled
            initial_weights = None
            if oracle:
                initial_weights = oracle.predict(payload)
                if initial_weights:
                    print(f"🔮 Using {len(initial_weights)} weights from Oracle as warm start.")

            tuned_state = run_tuning_loop(
                payload,
                solver_fn,
                max_iterations=args.tune_iters,
                min_iterations=args.tune_min_iters,
                min_improvement=0.001,
                use_conflict_resolution=True,
                learning_rate=args.learning_rate,
                use_annealing=args.use_annealing,
                use_locking=args.use_locking,
                use_fairness=args.use_fairness,
                use_volatility_rejection=args.use_volatility_rejection,
                initial_weights=initial_weights,
            )
            tuned_weights = tuned_state.get("weights", {})

            # Multi-shot final eval: run multiple solves, pick the best by combined score
            # Score = satisfaction + (fairness_weight * fairness_index)
            # This balances raw satisfaction with fairness
            FAIRNESS_WEIGHT = 0.5  # Each point of fairness idx worth 0.5 satisfaction
            best_score = -1.0
            best_ts, best_te, best_res, best_fair_idx = 0, 0, None, 0.0
            
            if args.parallel_regions > 0:
                # Use Parallel Regions (Ladder Search)
                # Calculate workers per region
                total_cores = os.cpu_count() or 1
                workers_per_region = max(1, total_cores // args.parallel_regions)
                
                best_res = run_parallel_regions(
                    payload,
                    tuned_weights,
                    num_regions=args.parallel_regions,
                    shots_per_region=args.shots_per_region,
                    time_limit_per_shot=args.time_limit,
                    workers_per_region=workers_per_region,
                    fairness_weight=FAIRNESS_WEIGHT
                )
                
                if best_res:
                    best_ts, best_te = satisfaction_counts(best_res.get("assignments", []), crew_rules, crew)
                    pc_shot = per_crew_satisfaction(best_res.get("assignments", []), crew_rules, crew)
                    _, _, _, best_fair_idx = fairness_stats(pc_shot)
            else:
                # Standard Sequential Ladder Logic
                # Ladder logic: pass previous best solution as hint to next shot
                previous_solution_hint = None
                
                t0 = time.perf_counter()
                for shot in range(args.final_shots):
                    res_tuned = solve(
                        payload,
                        time_limit_seconds=args.time_limit,
                        weights=tuned_weights,
                        random_seed=None,
                        num_workers=args.portfolio_workers,
                        solution_hint=previous_solution_hint,
                    )
                    if res_tuned.get("success"):
                        ts, te = satisfaction_counts(res_tuned.get("assignments", []), crew_rules, crew)
                        pc_shot = per_crew_satisfaction(res_tuned.get("assignments", []), crew_rules, crew)
                        _, _, _, shot_fair_idx = fairness_stats(pc_shot)
                        # Combined score: satisfaction + fairness bonus
                        combined_score = ts + (FAIRNESS_WEIGHT * shot_fair_idx)
                        
                        # Ladder: If this result is better, it becomes the hint for the next
                        if combined_score > best_score:
                            best_score = combined_score
                            best_ts, best_te, best_res, best_fair_idx = ts, te, res_tuned, shot_fair_idx
                            previous_solution_hint = res_tuned.get("assignments")
                dt = time.perf_counter() - t0
            
            if best_res is not None:
                pc_tuned = per_crew_satisfaction(best_res.get("assignments", []), crew_rules, crew)
                t_min_pct, t_max_pct, t_spread, t_fair_idx = fairness_stats(pc_tuned)
                tuned_portfolio_results.append(TrialResult("tuned_portfolio", best_ts, best_te, dt, t_min_pct, t_max_pct, t_spread, t_fair_idx))
                shots_label = f" (best of {args.final_shots})" if args.final_shots > 1 else ""
                print(f"  TunedPort: {best_ts}/{best_te} in {dt:.2f}s{shots_label} | fairness idx: {t_fair_idx:.1f} (spread {t_spread:.0f}%)")
                print(f"            Δ vs portfolio: sat {best_ts - s:+d}, fairness idx {t_fair_idx - fair_idx:+.1f}")
                
                # Record data if enabled
                if recorder:
                    recorder.record(
                        payload=payload,
                        weights=tuned_weights,
                        satisfaction=best_ts,
                        eligible=best_te,
                        fairness_index=t_fair_idx,
                        date=args.date,
                        metadata={
                            "mode": "parallel_regions" if args.parallel_regions > 0 else "sequential_ladder",
                            "runtime": dt,
                            "ladder_shots": args.shots_per_region if args.parallel_regions > 0 else args.final_shots,
                            "assignments": best_res.get("assignments")
                        }
                    )

    def summarize(label: str, rows: List[TrialResult]) -> None:
        if not rows:
            print(f"\n{label}: no successful trials")
            return
        sats = [r.satisfied for r in rows]
        secs = [r.seconds for r in rows]
        eligs = [r.eligible for r in rows]
        spreads = [r.spread for r in rows]
        fair_idxs = [r.fairness_index for r in rows]
        print(f"\n{label}")
        print(f"  satisfied mean: {statistics.mean(sats):.2f} (min={min(sats)}, max={max(sats)})")
        print(f"  eligible mean:  {statistics.mean(eligs):.2f}")
        print(f"  runtime mean:   {statistics.mean(secs):.2f}s")
        if len(rows) > 1:
            print(f"  satisfied std:  {statistics.pstdev(sats):.2f}")
        # Fairness stats
        print(f"  fairness index mean: {statistics.mean(fair_idxs):.1f} (100=equal, 0=unequal)")
        print(f"  fairness spread mean: {statistics.mean(spreads):.1f}%")

    summarize("Seeded (1 worker)", seeded_results)
    summarize("Portfolio (all cores)", portfolio_results)

    if args.tune_portfolio:
        summarize("Tuned under Portfolio", tuned_portfolio_results)
        if tuned_portfolio_results and portfolio_results:
            # Align by trial index (we only append when portfolio succeeded)
            n = min(len(tuned_portfolio_results), len(portfolio_results))
            deltas = [
                tuned_portfolio_results[i].satisfied - portfolio_results[i].satisfied
                for i in range(n)
            ]
            fair_idx_deltas = [
                tuned_portfolio_results[i].fairness_index - portfolio_results[i].fairness_index
                for i in range(n)
            ]
            print("\nTuned vs Portfolio Δ summary")
            print(f"  mean sat Δ: {statistics.mean(deltas):+.2f}")
            print(f"  min/max sat Δ: {min(deltas):+d}/{max(deltas):+d}")
            if len(deltas) > 1:
                print(f"  std sat Δ: {statistics.pstdev(deltas):.2f}")
            print(f"  mean fairness idx Δ: {statistics.mean(fair_idx_deltas):+.1f} (positive = fairer)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
