#!/usr/bin/env python3
"""
Collect training data by running the TUNING LOOP on multiple dates.
This builds a dataset where weights actually VARY, suitable for XGBoost training.

Unlike collect_training_data.py (which just runs parallel search with weights=1.0),
this script runs the full tuning loop which adjusts weights iteratively.

Usage:
  python3 collect_tuning_data.py --start 2025-12-13 --end 2025-12-13 --store 768 --runs-per-date 10
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop
from tuning_engine.metrics import satisfaction_counts, per_crew_satisfaction, fairness_stats
from tuning_engine.data_recorder import DataRecorder

DEFAULT_API_BASE = "http://localhost:4000"


def fetch_solver_input(api_base: str, store_id: str, date: str) -> Optional[Dict[str, Any]]:
    """Fetch solver input from API. Returns None if no data for that date."""
    url = f"{api_base}/solver/v2/input?storeId={store_id}&date={date}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
        if not result.get("success"):
            return None
        return result["data"]
    except Exception as e:
        print(f"  ⚠️ Failed to fetch {date}: {e}")
        return None


def generate_dates(start_date: str, end_date: str) -> List[str]:
    """Generate list of dates between start and end (inclusive)."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    dates = []
    current = start
    while current <= end:
        dates.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)
    return dates


def run_tuning_for_date(
    payload: Dict[str, Any],
    date: str,
    recorder: DataRecorder,
    max_iterations: int = 10,
    time_limit_seconds: int = 10,
) -> Optional[Dict[str, Any]]:
    """Run the tuning loop for a single date and record the TUNED weights.
    
    This actually runs iterative weight adjustment so we get varied weights.
    """
    
    # Filter to crew rules only
    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    if not crew_rules:
        crew_rules = all_rules  # Fallback
    
    crew = payload.get("crew", [])
    
    if not crew:
        print(f"  ⚠️ No crew scheduled for {date}")
        return None
    
    # Solver wrapper for the tuning loop
    def solver_fn(p, w):
        return solve(p, time_limit_seconds=time_limit_seconds, weights=w)
    
    # Run the tuning loop with momentum (bigger steps now!)
    t0 = time.perf_counter()
    state = run_tuning_loop(
        payload=payload,
        solver_fn=solver_fn,
        max_iterations=max_iterations,
        min_iterations=3,  # At least 3 iterations to get weight variation
        use_momentum=True,
        beta=0.5,  # Lower momentum = faster response
        learning_rate=1.0,  # Bigger steps
    )
    dt = time.perf_counter() - t0
    
    if not state or not state.get("assignments"):
        print(f"  ⚠️ Tuning failed for {date}")
        return None
    
    # Extract final weights from the tuning state
    final_weights = state.get("weights", {})
    assignments = state.get("assignments", [])
    
    sat, elig = satisfaction_counts(assignments, crew_rules, crew)
    pc = per_crew_satisfaction(assignments, crew_rules, crew)
    _, _, _, fair_idx = fairness_stats(pc)
    
    # Analyze weight variance
    weights_list = list(final_weights.values())
    import numpy as np
    w_min, w_max, w_std = np.min(weights_list), np.max(weights_list), np.std(weights_list)
    
    # Record the data with TUNED weights
    recorder.record(
        payload=payload,
        weights=final_weights,  # ← These are the TUNED weights!
        satisfaction=sat,
        eligible=elig,
        fairness_index=fair_idx,
        date=date,
        metadata={
            "mode": "tuning_loop",
            "runtime": dt,
            "max_iterations": max_iterations,
            "iterations_run": state.get("iterations", 0),
            "weight_stats": {
                "min": float(w_min),
                "max": float(w_max),
                "std": float(w_std),
            },
            "assignments": assignments,
        }
    )
    
    return {
        "satisfied": sat,
        "eligible": elig,
        "fairness": fair_idx,
        "runtime": dt,
        "crew_count": len(crew),
        "weight_variance": float(w_std),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect training data using TUNING LOOP (for weight variance)")
    parser.add_argument("--store", default="768", help="Store ID")
    parser.add_argument("--start", default="2025-12-13", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", default="2025-12-13", help="End date (YYYY-MM-DD)")
    parser.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL")
    # Tuning config
    parser.add_argument("--max-iterations", type=int, default=10, help="Max tuning iterations")
    parser.add_argument("--time-per-solve", type=int, default=10, help="Seconds per solve")
    parser.add_argument("--runs-per-date", type=int, default=10, help="Runs per date")
    parser.add_argument("--output", default="tuning_training_data.jsonl", help="Output file")
    
    args = parser.parse_args()
    
    print(f"🔧 Collecting TUNING training data")
    print(f"   Store: {args.store}")
    print(f"   Dates: {args.start} to {args.end}")
    print(f"   Max iterations: {args.max_iterations}")
    print(f"   Time per solve: {args.time_per_solve}s")
    print(f"   Runs per date: {args.runs_per_date}")
    print(f"   Output: {args.output}")
    print()
    
    dates = generate_dates(args.start, args.end)
    recorder = DataRecorder(output_path=args.output)
    
    total_runs = 0
    total_variance = 0.0
    
    for date in dates:
        print(f"\n📅 Processing {date}...")
        
        payload = fetch_solver_input(args.api, args.store, date)
        if not payload:
            print(f"  ⚠️ No data for {date}, skipping")
            continue
        
        for run_idx in range(args.runs_per_date):
            result = run_tuning_for_date(
                payload=payload,
                date=date,
                recorder=recorder,
                max_iterations=args.max_iterations,
                time_limit_seconds=args.time_per_solve,
            )
            
            if result:
                total_runs += 1
                total_variance += result.get("weight_variance", 0)
                pct = result["satisfied"] / result["eligible"] * 100 if result["eligible"] > 0 else 0
                print(f"   Run {run_idx + 1}/{args.runs_per_date}: {pct:.1f}% satisfaction, "
                      f"fairness={result['fairness']:.1f}, weight_std={result['weight_variance']:.3f}")
    
    avg_variance = total_variance / total_runs if total_runs > 0 else 0
    print(f"\n✅ Collected {total_runs} tuning runs")
    print(f"   Average weight std: {avg_variance:.3f}")
    print(f"   Saved to: {args.output}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
