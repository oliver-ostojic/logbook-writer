#!/usr/bin/env python3
"""Benchmark: ML Warm Start vs Cold Start using Engine V2 (Parallel Regions).

This script compares the effectiveness of using the NearestNeighborOracle
to warm-start the solver weights vs using uniform weights (cold start).

Uses the same tuning configuration as the frontend:
- numRegions: 10 (one per CPU core, capped at 10)
- shotsPerRegion: 3 (ladder iterations per region)
- timeLimitPerShot: 10s
- workersPerRegion: 1 (deterministic)
- fairnessWeight: 0.5

Metrics collected:
- Satisfaction score (satisfied / eligible rules)
- Fairness index (Gini-based, 0-100)
- Combined score (satisfaction + 0.5 * fairness_index)
- Solve time

Usage (from apps/solver-python):
  python benchmark_warm_vs_cold.py --store 768 --date 2025-11-25 --trials 10
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.parallel_search import run_parallel_regions
from tuning_engine.metrics import satisfaction_counts, per_crew_satisfaction, fairness_stats
from learning.oracle import NearestNeighborOracle

DEFAULT_API_BASE = "http://localhost:4000"
DEFAULT_CACHE = "benchmark_solver_input.json"

# Frontend tuning config (Engine V2)
FRONTEND_CONFIG = {
    "numRegions": 10,
    "shotsPerRegion": 3,
    "timeLimitPerShot": 10,
    "workersPerRegion": 1,
    "fairnessWeight": 0.5,
}


@dataclass
class TrialResult:
    mode: str  # "warm" or "cold"
    satisfied: int
    eligible: int
    satisfaction_pct: float
    fairness_index: float
    combined_score: float
    solve_time: float


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
        print(f"📂 Loading cached solver input from: {cache_path}", file=sys.stderr)
        with open(cache_path, "r") as f:
            return json.load(f)

    print(f"🔍 Fetching solver input from API...", file=sys.stderr)
    payload = fetch_solver_input(api_base, store_id, date)
    with open(cache_path, "w") as f:
        json.dump(payload, f)
    print(f"💾 Cached solver input to: {cache_path}", file=sys.stderr)
    return payload


def run_single_trial(
    payload: Dict[str, Any],
    weights: Dict[int, float],
    crew_rules: List[Dict[str, Any]],
    crew: List[Dict[str, Any]],
    mode: str,
    config: Dict[str, Any],
) -> Optional[TrialResult]:
    """Run a single trial with the parallel region search."""
    t0 = time.perf_counter()
    
    result = run_parallel_regions(
        payload=payload,
        weights=weights,
        num_regions=config["numRegions"],
        shots_per_region=config["shotsPerRegion"],
        time_limit_per_shot=config["timeLimitPerShot"],
        workers_per_region=config["workersPerRegion"],
        fairness_weight=config["fairnessWeight"],
    )
    
    solve_time = time.perf_counter() - t0
    
    if not result or not result.get("success"):
        return None
    
    assignments = result.get("assignments", [])
    satisfied, eligible = satisfaction_counts(assignments, crew_rules, crew)
    satisfaction_pct = (satisfied / eligible * 100) if eligible > 0 else 0.0
    
    pc = per_crew_satisfaction(assignments, crew_rules, crew)
    _, _, _, fairness_index = fairness_stats(pc)
    
    combined_score = satisfied + (config["fairnessWeight"] * fairness_index)
    
    return TrialResult(
        mode=mode,
        satisfied=satisfied,
        eligible=eligible,
        satisfaction_pct=satisfaction_pct,
        fairness_index=fairness_index,
        combined_score=combined_score,
        solve_time=solve_time,
    )


def compute_statistics(results: List[TrialResult], label: str) -> Dict[str, Any]:
    """Compute statistics for a set of trial results."""
    if not results:
        return {"label": label, "n": 0, "error": "No successful trials"}
    
    satisfaction_pcts = [r.satisfaction_pct for r in results]
    fairness_indices = [r.fairness_index for r in results]
    combined_scores = [r.combined_score for r in results]
    solve_times = [r.solve_time for r in results]
    
    def safe_stdev(values: List[float]) -> float:
        return statistics.stdev(values) if len(values) > 1 else 0.0
    
    return {
        "label": label,
        "n": len(results),
        "satisfaction": {
            "mean": statistics.mean(satisfaction_pcts),
            "stdev": safe_stdev(satisfaction_pcts),
            "min": min(satisfaction_pcts),
            "max": max(satisfaction_pcts),
            "median": statistics.median(satisfaction_pcts),
        },
        "fairness": {
            "mean": statistics.mean(fairness_indices),
            "stdev": safe_stdev(fairness_indices),
            "min": min(fairness_indices),
            "max": max(fairness_indices),
            "median": statistics.median(fairness_indices),
        },
        "combined_score": {
            "mean": statistics.mean(combined_scores),
            "stdev": safe_stdev(combined_scores),
            "min": min(combined_scores),
            "max": max(combined_scores),
        },
        "solve_time": {
            "mean": statistics.mean(solve_times),
            "stdev": safe_stdev(solve_times),
            "min": min(solve_times),
            "max": max(solve_times),
        },
    }


def print_comparison_report(warm_stats: Dict, cold_stats: Dict) -> None:
    """Print a formatted comparison report."""
    print("\n" + "=" * 70)
    print("🔬 BENCHMARK RESULTS: ML WARM START vs COLD START")
    print("=" * 70)
    
    print(f"\nConfiguration (Frontend Engine V2):")
    print(f"  - Parallel regions: {FRONTEND_CONFIG['numRegions']}")
    print(f"  - Shots per region: {FRONTEND_CONFIG['shotsPerRegion']}")
    print(f"  - Time limit per shot: {FRONTEND_CONFIG['timeLimitPerShot']}s")
    print(f"  - Workers per region: {FRONTEND_CONFIG['workersPerRegion']}")
    print(f"  - Fairness weight: {FRONTEND_CONFIG['fairnessWeight']}")
    
    print(f"\n{'Metric':<25} {'Warm Start':<20} {'Cold Start':<20} {'Δ (Warm - Cold)':<15}")
    print("-" * 80)
    
    # Satisfaction
    warm_sat = warm_stats["satisfaction"]
    cold_sat = cold_stats["satisfaction"]
    delta_sat = warm_sat["mean"] - cold_sat["mean"]
    print(f"{'Satisfaction % (mean)':<25} {warm_sat['mean']:>6.2f} ± {warm_sat['stdev']:.2f}      {cold_sat['mean']:>6.2f} ± {cold_sat['stdev']:.2f}      {delta_sat:>+.2f}")
    print(f"{'Satisfaction % (median)':<25} {warm_sat['median']:>6.2f}               {cold_sat['median']:>6.2f}")
    print(f"{'Satisfaction % (range)':<25} [{warm_sat['min']:.1f}, {warm_sat['max']:.1f}]         [{cold_sat['min']:.1f}, {cold_sat['max']:.1f}]")
    
    # Fairness
    warm_fair = warm_stats["fairness"]
    cold_fair = cold_stats["fairness"]
    delta_fair = warm_fair["mean"] - cold_fair["mean"]
    print(f"\n{'Fairness Index (mean)':<25} {warm_fair['mean']:>6.2f} ± {warm_fair['stdev']:.2f}      {cold_fair['mean']:>6.2f} ± {cold_fair['stdev']:.2f}      {delta_fair:>+.2f}")
    print(f"{'Fairness Index (median)':<25} {warm_fair['median']:>6.2f}               {cold_fair['median']:>6.2f}")
    
    # Combined Score
    warm_comb = warm_stats["combined_score"]
    cold_comb = cold_stats["combined_score"]
    delta_comb = warm_comb["mean"] - cold_comb["mean"]
    print(f"\n{'Combined Score (mean)':<25} {warm_comb['mean']:>6.2f} ± {warm_comb['stdev']:.2f}      {cold_comb['mean']:>6.2f} ± {cold_comb['stdev']:.2f}      {delta_comb:>+.2f}")
    
    # Solve Time
    warm_time = warm_stats["solve_time"]
    cold_time = cold_stats["solve_time"]
    delta_time = warm_time["mean"] - cold_time["mean"]
    print(f"\n{'Solve Time (mean)':<25} {warm_time['mean']:>6.1f}s ± {warm_time['stdev']:.1f}s      {cold_time['mean']:>6.1f}s ± {cold_time['stdev']:.1f}s      {delta_time:>+.1f}s")
    
    print("\n" + "=" * 70)
    print("📊 INTERPRETATION")
    print("=" * 70)
    
    # Determine winner
    if delta_sat > 0.5:
        print(f"\n✅ WARM START wins on satisfaction by {delta_sat:.2f} percentage points")
    elif delta_sat < -0.5:
        print(f"\n❌ COLD START wins on satisfaction by {-delta_sat:.2f} percentage points")
    else:
        print(f"\n🤝 SATISFACTION is roughly equal (Δ = {delta_sat:.2f}%)")
    
    if delta_fair > 1:
        print(f"✅ WARM START is more fair by {delta_fair:.1f} index points")
    elif delta_fair < -1:
        print(f"❌ COLD START is more fair by {-delta_fair:.1f} index points")
    else:
        print(f"🤝 FAIRNESS is roughly equal (Δ = {delta_fair:.1f})")
    
    # Variance comparison
    if warm_sat["stdev"] < cold_sat["stdev"] * 0.8:
        print(f"✅ WARM START is more consistent (σ={warm_sat['stdev']:.2f} vs σ={cold_sat['stdev']:.2f})")
    elif cold_sat["stdev"] < warm_sat["stdev"] * 0.8:
        print(f"❌ COLD START is more consistent (σ={cold_sat['stdev']:.2f} vs σ={warm_sat['stdev']:.2f})")
    else:
        print(f"🤝 Consistency is similar (σ_warm={warm_sat['stdev']:.2f}, σ_cold={cold_sat['stdev']:.2f})")
    
    # Effect size (Cohen's d approximation)
    pooled_stdev = ((warm_sat["stdev"]**2 + cold_sat["stdev"]**2) / 2) ** 0.5
    if pooled_stdev > 0:
        cohens_d = delta_sat / pooled_stdev
        effect_label = "negligible" if abs(cohens_d) < 0.2 else "small" if abs(cohens_d) < 0.5 else "medium" if abs(cohens_d) < 0.8 else "large"
        print(f"\n📐 Effect size (Cohen's d): {cohens_d:.2f} ({effect_label})")
    
    print("\n" + "=" * 70)


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark ML Warm Start vs Cold Start")
    parser.add_argument("--store", default="768", help="Store ID")
    parser.add_argument("--date", default="2025-11-25", help="Date for solver input")
    parser.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL")
    parser.add_argument("--cache", default=DEFAULT_CACHE, help="Cache file path")
    parser.add_argument("--trials", type=int, default=10, help="Number of trials per mode")
    parser.add_argument("--training-data", default="solver_training_data.jsonl", help="Path to training data for Oracle")
    args = parser.parse_args()
    
    print(f"\n🚀 ML Warm Start vs Cold Start Benchmark", file=sys.stderr)
    print(f"   Store: {args.store} | Date: {args.date} | Trials: {args.trials}", file=sys.stderr)
    
    # Load payload
    payload = load_or_fetch_payload(
        api_base=args.api,
        store_id=args.store,
        date=args.date,
        cache_path=args.cache,
    )
    
    # Extract crew rules
    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    if not crew_rules:
        crew_rules = all_rules  # Fallback
    crew = payload.get("crew", [])
    
    print(f"   Crew rules: {len(crew_rules)} | Crew: {len(crew)}", file=sys.stderr)
    
    # Initialize Oracle
    oracle = NearestNeighborOracle(data_path=args.training_data)
    
    # Get warm start weights from Oracle
    warm_weights = oracle.predict(payload)
    if warm_weights:
        print(f"   Oracle provided {len(warm_weights)} weights for warm start", file=sys.stderr)
    else:
        print(f"   ⚠️ Oracle returned no weights, using uniform as fallback", file=sys.stderr)
        warm_weights = {rule.get("id", i): 1.0 for i, rule in enumerate(crew_rules)}
    
    # Cold start weights (uniform)
    cold_weights = {rule.get("id", i): 1.0 for i, rule in enumerate(crew_rules)}
    
    warm_results: List[TrialResult] = []
    cold_results: List[TrialResult] = []
    
    # Run trials
    print(f"\n🔥 Running {args.trials} WARM START trials...", file=sys.stderr)
    for i in range(args.trials):
        print(f"  Trial {i+1}/{args.trials}...", file=sys.stderr, end=" ", flush=True)
        result = run_single_trial(payload, warm_weights, crew_rules, crew, "warm", FRONTEND_CONFIG)
        if result:
            warm_results.append(result)
            print(f"✓ {result.satisfaction_pct:.1f}% sat, {result.fairness_index:.1f} fair", file=sys.stderr)
        else:
            print(f"✗ Failed", file=sys.stderr)
    
    print(f"\n❄️ Running {args.trials} COLD START trials...", file=sys.stderr)
    for i in range(args.trials):
        print(f"  Trial {i+1}/{args.trials}...", file=sys.stderr, end=" ", flush=True)
        result = run_single_trial(payload, cold_weights, crew_rules, crew, "cold", FRONTEND_CONFIG)
        if result:
            cold_results.append(result)
            print(f"✓ {result.satisfaction_pct:.1f}% sat, {result.fairness_index:.1f} fair", file=sys.stderr)
        else:
            print(f"✗ Failed", file=sys.stderr)
    
    # Compute statistics
    warm_stats = compute_statistics(warm_results, "Warm Start (ML Oracle)")
    cold_stats = compute_statistics(cold_results, "Cold Start (Uniform Weights)")
    
    # Print report
    print_comparison_report(warm_stats, cold_stats)
    
    # Also output raw JSON for further analysis
    output = {
        "config": FRONTEND_CONFIG,
        "trials": args.trials,
        "warm_start": warm_stats,
        "cold_start": cold_stats,
        "raw_warm": [
            {
                "satisfied": r.satisfied,
                "eligible": r.eligible,
                "satisfaction_pct": r.satisfaction_pct,
                "fairness_index": r.fairness_index,
                "combined_score": r.combined_score,
                "solve_time": r.solve_time,
            }
            for r in warm_results
        ],
        "raw_cold": [
            {
                "satisfied": r.satisfied,
                "eligible": r.eligible,
                "satisfaction_pct": r.satisfaction_pct,
                "fairness_index": r.fairness_index,
                "combined_score": r.combined_score,
                "solve_time": r.solve_time,
            }
            for r in cold_results
        ],
    }
    
    with open("benchmark_results.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n📁 Raw results saved to: benchmark_results.json", file=sys.stderr)
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
