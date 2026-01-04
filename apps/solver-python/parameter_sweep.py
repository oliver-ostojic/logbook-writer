"""Parameter sweep for tuning engine optimization.

Tests multiple parameter combinations across different dates to find
stable settings that work well across various schedules.
"""

import requests
import json
import sys
import time
from typing import Dict, List, Any, Tuple
from itertools import product

# Add solver path
sys.path.insert(0, '/Users/oliver-ostojic/Desktop/logbook-writer/apps/solver-python')

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop, vectorize_satisfaction, global_score
from tuning_engine.satisfaction_calculator import calculate_satisfaction

# Test configuration
STORE_ID = 768
TEST_DATES = ["2025-11-25"]  # Single date for quick testing
API_BASE = "http://localhost:4000"

# Cached payload files (use if API not available)
CACHED_PAYLOADS = {
    "2025-11-25": "/Users/oliver-ostojic/Desktop/logbook-writer/apps/api/solver_input_live_768_2025-11-25.json",
}

# Parameter grid to test
PARAM_GRID = {
    "beta": [0.85, 0.9, 0.95],           # Momentum
    "learning_rate": [0.15, 0.3, 0.5],   # Step size
    "max_iterations": [10, 15, 20],      # Iteration limit
    "conflict_threshold": [-0.3, -0.5, -0.7],  # Conflict detection threshold
}

# Reduced grid for quick testing (only 4 combinations)
QUICK_GRID = {
    "beta": [0.9],
    "learning_rate": [0.2, 0.4],
    "max_iterations": [10, 15],
}


def fetch_payload(date: str) -> Dict[str, Any]:
    """Fetch solver input from API or cached file."""
    # Try cached file first
    if date in CACHED_PAYLOADS:
        cached_path = CACHED_PAYLOADS[date]
        try:
            with open(cached_path, 'r') as f:
                payload = json.load(f)
                if payload.get("crew") and payload.get("roleRules"):
                    print(f"   (using cached file)")
                    return payload
        except Exception:
            pass
    
    # Fall back to API
    url = f"{API_BASE}/solver/v2/input?storeId={STORE_ID}&date={date}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def run_solver(payload: Dict, weights: Dict[int, float] = None) -> Dict[str, Any]:
    """Run solver with optional weight overrides."""
    if weights:
        for rule in payload.get("roleRules", []):
            rule_id = rule.get("id")
            if rule_id in weights:
                rule["weight"] = weights[rule_id]
    
    return solve(payload)


def evaluate_params(
    payload: Dict,
    beta: float,
    learning_rate: float,
    max_iterations: int,
    use_conflicts: bool = True,
) -> Dict[str, Any]:
    """Run tuning loop with specific parameters and return metrics."""
    
    def solver_wrapper(p, w):
        return run_solver(p, w)
    
    # Get crew rules for evaluation
    # Filter by source='crew' OR crewId being set (for cached files without source)
    all_rules = list(payload.get("roleRules") or [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew" or r.get("crewId")]
    
    # Initial solve baseline
    initial_result = run_solver(payload)
    initial_assignments = initial_result.get("assignments", [])
    crew = payload.get("crew", [])
    initial_satisfaction = vectorize_satisfaction(initial_assignments, crew_rules, crew)
    initial_eligible = sum(1 for s in initial_satisfaction if s >= 0)
    initial_satisfied = sum(1 for s in initial_satisfaction if s == 1)
    
    # Run tuning loop
    start_time = time.time()
    state = run_tuning_loop(
        payload,
        solver_wrapper,
        max_iterations=max_iterations,
        min_iterations=3,
        min_improvement=0.001,
        use_momentum=True,
        use_conflict_resolution=use_conflicts,
        beta=beta,
        learning_rate=learning_rate,
    )
    elapsed = time.time() - start_time
    
    # Get final metrics from last satisfaction in history
    final_satisfaction = state["satisfaction_history"][-1] if state["satisfaction_history"] else []
    final_eligible = sum(1 for s in final_satisfaction if s >= 0)
    final_satisfied = sum(1 for s in final_satisfaction if s == 1)
    final_score = global_score(final_satisfaction, state["weights"], crew_rules)
    
    # Find best iteration
    best_satisfied = 0
    best_iter = 0
    for i, sat in enumerate(state["satisfaction_history"]):
        satisfied = sum(1 for s in sat if s == 1)
        if satisfied > best_satisfied:
            best_satisfied = satisfied
            best_iter = i
    
    return {
        "initial_satisfied": initial_satisfied,
        "initial_eligible": initial_eligible,
        "final_satisfied": final_satisfied,
        "final_eligible": final_eligible,
        "best_satisfied": best_satisfied,
        "best_iter": best_iter,
        "final_score": final_score,
        "iterations": state["iteration"] + 1,
        "converged": state["converged"],
        "elapsed_seconds": elapsed,
        "improvement": final_satisfied - initial_satisfied,
        "best_improvement": best_satisfied - initial_satisfied,
    }


def run_parameter_sweep(quick: bool = True):
    """Run parameter sweep across dates."""
    
    grid = QUICK_GRID if quick else PARAM_GRID
    
    print("=" * 80)
    print("PARAMETER SWEEP FOR TUNING ENGINE")
    print("=" * 80)
    print(f"Dates: {TEST_DATES}")
    print(f"Parameters: {list(grid.keys())}")
    print(f"Grid size: {len(list(product(*grid.values())))} combinations")
    print()
    
    # Fetch payloads for all dates
    payloads = {}
    for date in TEST_DATES:
        print(f"📥 Fetching payload for {date}...")
        try:
            payloads[date] = fetch_payload(date)
            # Filter by source='crew' OR crewId being set
            crew_rules = [r for r in payloads[date].get("roleRules", []) 
                         if r.get("source") == "crew" or r.get("crewId")]
            print(f"   ✓ {len(payloads[date].get('crew', []))} crew, {len(crew_rules)} crew rules")
        except Exception as e:
            print(f"   ✗ Failed: {e}")
            return
    
    print()
    
    # Generate all parameter combinations
    param_names = list(grid.keys())
    param_values = list(grid.values())
    combinations = list(product(*param_values))
    
    results = []
    
    print(f"🔬 Testing {len(combinations)} parameter combinations...")
    print("-" * 80)
    
    for i, combo in enumerate(combinations):
        params = dict(zip(param_names, combo))
        
        # Test on all dates
        date_results = {}
        total_improvement = 0
        total_best_improvement = 0
        
        for date in TEST_DATES:
            metrics = evaluate_params(
                payloads[date],
                beta=params.get("beta", 0.9),
                learning_rate=params.get("learning_rate", 0.3),
                max_iterations=params.get("max_iterations", 15),
                use_conflicts=True,
            )
            date_results[date] = metrics
            total_improvement += metrics["improvement"]
            total_best_improvement += metrics["best_improvement"]
        
        # Aggregate results
        avg_improvement = total_improvement / len(TEST_DATES)
        avg_best_improvement = total_best_improvement / len(TEST_DATES)
        
        result = {
            "params": params,
            "date_results": date_results,
            "avg_improvement": avg_improvement,
            "avg_best_improvement": avg_best_improvement,
            "consistent": all(r["improvement"] >= 0 for r in date_results.values()),
        }
        results.append(result)
        
        # Progress output
        status = "✓" if result["consistent"] else "⚠"
        print(f"[{i+1}/{len(combinations)}] {status} β={params.get('beta', 0.9):.2f} "
              f"lr={params.get('learning_rate', 0.3):.2f} "
              f"iter={params.get('max_iterations', 15):2d} "
              f"| avg_imp={avg_improvement:+.1f} best={avg_best_improvement:+.1f}")
    
    print()
    print("=" * 80)
    print("RESULTS SUMMARY")
    print("=" * 80)
    
    # Sort by average best improvement
    results.sort(key=lambda x: x["avg_best_improvement"], reverse=True)
    
    print("\n🏆 TOP 5 PARAMETER COMBINATIONS (by avg best improvement):")
    print("-" * 80)
    
    for i, r in enumerate(results[:5]):
        p = r["params"]
        print(f"\n{i+1}. β={p.get('beta', 0.9):.2f}, lr={p.get('learning_rate', 0.3):.2f}, "
              f"max_iter={p.get('max_iterations', 15)}")
        print(f"   Avg improvement: {r['avg_improvement']:+.1f} rules")
        print(f"   Avg BEST improvement: {r['avg_best_improvement']:+.1f} rules")
        print(f"   Consistent (all dates ≥0): {r['consistent']}")
        
        for date, metrics in r["date_results"].items():
            print(f"   {date}: {metrics['initial_satisfied']}→{metrics['final_satisfied']} "
                  f"(best: {metrics['best_satisfied']} at iter {metrics['best_iter']}) "
                  f"[{metrics['elapsed_seconds']:.1f}s]")
    
    # Find most stable params (consistent improvement on all dates)
    consistent_results = [r for r in results if r["consistent"]]
    
    print(f"\n📊 STABILITY ANALYSIS:")
    print(f"   {len(consistent_results)}/{len(results)} combinations improved on ALL dates")
    
    if consistent_results:
        # Find param values that appear most in consistent results
        print("\n   Most stable parameter values:")
        for param in param_names:
            value_counts = {}
            for r in consistent_results:
                v = r["params"].get(param)
                value_counts[v] = value_counts.get(v, 0) + 1
            
            best_value = max(value_counts, key=value_counts.get)
            print(f"   - {param}: {best_value} (appears in {value_counts[best_value]}/{len(consistent_results)} stable configs)")
    
    # Save results
    output = {
        "dates": TEST_DATES,
        "grid": grid,
        "results": results,
        "top_params": results[0]["params"] if results else None,
    }
    
    with open("parameter_sweep_results.json", "w") as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\n📁 Full results saved to parameter_sweep_results.json")
    
    return results


if __name__ == "__main__":
    # Use --full for full grid search
    quick_mode = "--full" not in sys.argv
    
    if quick_mode:
        print("Running QUICK sweep (use --full for complete grid)")
    else:
        print("Running FULL parameter sweep")
    
    run_parameter_sweep(quick=quick_mode)
