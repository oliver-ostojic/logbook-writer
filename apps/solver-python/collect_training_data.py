#!/usr/bin/env python3
"""
Collect training data by running the solver on multiple dates.
This builds the dataset for the Learning-to-Optimize system.

Uses parallel regions (relay teams) for optimal schedule generation:
- 10 parallel regions (one per CPU core)
- 3 ladder shots per region (progressive improvement with solution hints)
- Combined scoring: satisfaction + (0.5 × fairness_index)

Usage:
  python3 collect_training_data.py --start 2025-11-25 --end 2025-12-16 --store 768 --runs-per-date 30
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
from tuning_engine.parallel_search import run_parallel_regions
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


def run_for_date(
    payload: Dict[str, Any],
    date: str,
    recorder: DataRecorder,
    num_regions: int = 10,
    shots_per_region: int = 3,
    time_limit_per_shot: int = 5,
    fairness_weight: float = 0.5,
) -> Optional[Dict[str, Any]]:
    """Run parallel region search for a single date and record the result.
    
    Uses the optimized relay teams configuration:
    - Multiple parallel regions explore different parts of solution space
    - Each region does ladder search (solution hints for progressive improvement)
    - Best result picked by combined score: satisfaction + (fairness_weight × fairness_index)
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
    
    # Initial weights (all 1.0)
    initial_weights = {
        rule.get("id", i): 1.0 
        for i, rule in enumerate(crew_rules)
    }
    
    # Calculate workers per region (use all cores, divided among regions)
    total_cores = os.cpu_count() or 4
    workers_per_region = max(1, total_cores // num_regions)
    
    # Run parallel region search
    t0 = time.perf_counter()
    result = run_parallel_regions(
        payload=payload,
        weights=initial_weights,
        num_regions=num_regions,
        shots_per_region=shots_per_region,
        time_limit_per_shot=time_limit_per_shot,
        workers_per_region=workers_per_region,
        fairness_weight=fairness_weight,
    )
    dt = time.perf_counter() - t0
    
    if not result or not result.get("success"):
        print(f"  ⚠️ Solver failed for {date}")
        return None
    
    assignments = result.get("assignments", [])
    sat, elig = satisfaction_counts(assignments, crew_rules, crew)
    pc = per_crew_satisfaction(assignments, crew_rules, crew)
    _, _, _, fair_idx = fairness_stats(pc)
    
    # Record the data
    recorder.record(
        payload=payload,
        weights=initial_weights,  # We're not tuning weights here, just using parallel search
        satisfaction=sat,
        eligible=elig,
        fairness_index=fair_idx,
        date=date,
        metadata={
            "mode": "parallel_regions",
            "runtime": dt,
            "num_regions": num_regions,
            "shots_per_region": shots_per_region,
            "time_limit_per_shot": time_limit_per_shot,
            "assignments": assignments,
        }
    )
    
    return {
        "satisfied": sat,
        "eligible": elig,
        "fairness": fair_idx,
        "runtime": dt,
        "crew_count": len(crew),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect training data for L2O using parallel regions")
    parser.add_argument("--store", default="768", help="Store ID")
    parser.add_argument("--start", default="2025-11-25", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", default="2025-12-16", help="End date (YYYY-MM-DD)")
    parser.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL")
    # Parallel regions config
    parser.add_argument("--num-regions", type=int, default=10, help="Number of parallel regions (relay teams)")
    parser.add_argument("--shots-per-region", type=int, default=3, help="Ladder shots per region")
    parser.add_argument("--time-per-shot", type=int, default=5, help="Seconds per shot")
    parser.add_argument("--fairness-weight", type=float, default=0.5, help="Fairness weight in scoring")
    parser.add_argument("--max-records", type=int, default=100, help="Stop after this many successful records")
    parser.add_argument("--runs-per-date", type=int, default=1, help="Number of runs per date (for generating variations)")
    parser.add_argument("--output", default="solver_training_data.jsonl", help="Output file")
    args = parser.parse_args()
    
    dates = generate_dates(args.start, args.end)
    print(f"📅 Processing {len(dates)} dates from {args.start} to {args.end}")
    print(f"🔄 Runs per date: {args.runs_per_date}")
    print(f"🏪 Store: {args.store}")
    print(f"🚀 Parallel regions: {args.num_regions} regions × {args.shots_per_region} shots × {args.time_per_shot}s")
    print(f"⚖️  Fairness weight: {args.fairness_weight}")
    print(f"📊 Max records: {args.max_records}")
    print(f"💾 Output: {args.output}")
    print()
    
    recorder = DataRecorder(output_file=args.output)
    
    successful = 0
    skipped = 0
    failed = 0
    
    for i, date in enumerate(dates):
        if successful >= args.max_records:
            print(f"\n✅ Reached {args.max_records} records, stopping.")
            break
        
        # Fetch payload once per date
        payload = fetch_solver_input(args.api, args.store, date)
        if not payload:
            print(f"[{i+1}/{len(dates)}] {date}... ⏭️ No data")
            skipped += 1
            continue
        
        # Run multiple iterations per date
        for run in range(args.runs_per_date):
            if successful >= args.max_records:
                break
                
            run_label = f"[{i+1}/{len(dates)}] {date} (run {run+1}/{args.runs_per_date})..."
            print(run_label, end=" ", flush=True)
            
            # Run parallel region search
            result = run_for_date(
                payload,
                date,
                recorder,
                num_regions=args.num_regions,
                shots_per_region=args.shots_per_region,
                time_limit_per_shot=args.time_per_shot,
                fairness_weight=args.fairness_weight,
            )
            
            if result:
                pct = 100 * result["satisfied"] / result["eligible"] if result["eligible"] > 0 else 0
                print(f"✅ {result['satisfied']}/{result['eligible']} ({pct:.0f}%) | "
                      f"fairness: {result['fairness']:.1f} | "
                      f"crew: {result['crew_count']} | "
                      f"{result['runtime']:.1f}s")
                successful += 1
            else:
                print("❌ Failed")
                failed += 1
    
    print()
    print("=" * 60)
    print(f"📊 Summary")
    print(f"  ✅ Successful: {successful}")
    print(f"  ⏭️  Skipped:    {skipped}")
    print(f"  ❌ Failed:     {failed}")
    print(f"  💾 Data saved to: {args.output}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
