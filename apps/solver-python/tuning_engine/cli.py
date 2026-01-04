#!/usr/bin/env python3
"""Command-line entry point for the tuning engine with parallel region search.

This CLI provides optimized schedule generation using:
- Multiple parallel regions exploring different parts of the solution space
- Ladder search within each region (solution hints for progressive improvement)
- Combined scoring: satisfaction + fairness

OPTIMAL CONFIGURATION (tested December 25, 2025):
- num_regions=14 (best speed/quality balance)
- shots_per_region=3 (quick ladder iterations)
- time_limit_per_shot=15 (fast but thorough)
- workers_per_region=1 (deterministic within region)
- fairness_weight=0.5 (balanced)
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict

from .parallel_search import run_parallel_regions
from logbook_solver_v2 import solve


class TuningCliError(Exception):
    """Raised when the CLI cannot parse input or run the tuner."""


def _read_payload() -> Dict[str, Any]:
    try:
        raw = json.load(sys.stdin)
    except Exception as exc:
        raise TuningCliError(f"Failed to parse tuning payload: {exc}") from exc

    if not isinstance(raw, dict):
        raise TuningCliError("Tuning payload must be a JSON object")
    return raw


def _emit_json(data: Dict[str, Any]) -> None:
    json.dump(data, sys.stdout)


def main() -> int:
    try:
        payload = _read_payload()
        solver_input = payload.get("solverInput") or payload
        
        # Tuning configuration
        config = payload.get("tuningConfig", {})
        
        # Default to using all CPU cores for parallel regions
        cpu_count = os.cpu_count() or 4
        
        # OPTIMAL CONFIG: 14 regions × 3 shots (tested Dec 25, 2025)
        num_regions = config.get("numRegions", 14)  # Optimal: 14 regions
        shots_per_region = config.get("shotsPerRegion", 3)  # Ladder iterations per region
        time_limit_per_shot = config.get("timeLimitPerShot", 15)  # Seconds per solve
        workers_per_region = config.get("workersPerRegion", 1)  # Workers per region
        fairness_weight = config.get("fairnessWeight", 0.5)
        
        # All rules use weight 1.0 (weight tuning doesn't improve results)
        all_rules = solver_input.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        
        weights = {
            rule.get("id", i): 1.0 
            for i, rule in enumerate(crew_rules)
        }
        
        print(f"🔧 Parallel Region Search Configuration:", file=sys.stderr)
        print(f"   Parallel regions: {num_regions}", file=sys.stderr)
        print(f"   Shots per region: {shots_per_region}", file=sys.stderr)
        print(f"   Time limit per shot: {time_limit_per_shot}s", file=sys.stderr)
        print(f"   Workers per region: {workers_per_region}", file=sys.stderr)
        print(f"   Fairness weight: {fairness_weight}", file=sys.stderr)
        print(f"   Crew rules: {len(crew_rules)}", file=sys.stderr)
        
        # Run parallel regions with ladder search (no weight tuning)
        result = run_parallel_regions(
            payload=solver_input,
            weights=weights,
            num_regions=num_regions,
            shots_per_region=shots_per_region,
            time_limit_per_shot=time_limit_per_shot,
            workers_per_region=workers_per_region,
            fairness_weight=fairness_weight,
        )
        
        if result is None:
            # Fallback to single solve if parallel search fails
            print("⚠️  Parallel search failed, falling back to single solve...", file=sys.stderr)
            result = solve(
                solver_input,
                time_limit_seconds=num_regions * shots_per_region * time_limit_per_shot,
                weights=weights,
            )
        
        if result:
            # Add metadata
            if "metadata" not in result:
                result["metadata"] = {}
            result["metadata"]["parallelSearch"] = True
            result["metadata"]["config"] = {
                "numRegions": num_regions,
                "shotsPerRegion": shots_per_region,
                "timeLimitPerShot": time_limit_per_shot,
                "workersPerRegion": workers_per_region,
                "fairnessWeight": fairness_weight,
            }
        
        _emit_json(result or {"success": False, "error": "No result from parallel search"})
        return 0
        
    except TuningCliError as exc:
        _emit_json({"success": False, "error": str(exc)})
        return 1
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        _emit_json({"success": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
