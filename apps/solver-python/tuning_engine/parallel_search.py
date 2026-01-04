import multiprocessing
import sys
import time
import random
from typing import Dict, Any, List, Tuple, Optional
from logbook_solver_v2 import solve
from .metrics import satisfaction_counts, per_crew_satisfaction, fairness_stats


def run_single_tuning_region(args: Tuple) -> Dict[str, Any]:
    """
    Worker function to run tuning loop in a single region.
    Each region uses a different random seed, leading to different weight trajectories.
    
    Uses all tuning modules for best results:
    - Momentum-based weight updates
    - Annealing (escape local optima)
    - Locking (stop wasting effort on impossible rules)
    - Fairness (boost bottom 10%, dampen top 10%)
    - Volatility rejection (prevent chaotic weight swings)
    
    Args tuple: (payload, initial_weights, tuning_iterations, time_limit, seed, fairness_weight)
    """
    # Import here to avoid circular imports in worker process
    from .driver import run_tuning_loop
    
    payload, initial_weights, tuning_iterations, time_limit, seed, fairness_weight = args
    
    # Extract rules for scoring
    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    crew = payload.get("crew", [])
    
    # Create solver function with this region's seed
    def solver_fn(p, w):
        return solve(p, time_limit_seconds=time_limit, weights=w, random_seed=seed)
    
    # Run tuning loop with ALL modules enabled
    # min_iterations should be at least tuning_iterations-1 to force weight changes
    min_iters = max(3, tuning_iterations - 1)
    try:
        state = run_tuning_loop(
            payload=payload,
            solver_fn=solver_fn,
            max_iterations=tuning_iterations,
            min_iterations=min_iters,
            use_momentum=True,
            use_annealing=True,           # Escape local optima
            use_locking=True,             # Stop wasting effort on impossible rules
            use_fairness=True,            # Boost bottom 10%, dampen top 10%
            use_volatility_rejection=True, # Prevent chaotic weight swings
            volatility_threshold=0.10,     # Reject if >10% rules flip
            initial_weights=initial_weights,
            return_last_weights=False,     # Return best weights (modules should help now)
        )
    except Exception as e:
        print(f"   ⚠️ Region {seed} failed: {e}", file=sys.stderr)
        return None
    
    if not state:
        return None
    
    final_weights = state.get("weights", {})
    
    # Run solver one more time with tuned weights to get final assignments
    final_result = solver_fn(payload, final_weights)
    assignments = final_result.get("assignments", [])
    
    if not assignments:
        return None
    
    ts, te = satisfaction_counts(assignments, crew_rules, crew)
    pc = per_crew_satisfaction(assignments, crew_rules, crew)
    _, _, _, fair_idx = fairness_stats(pc)
    
    combined_score = ts + (fairness_weight * fair_idx)
    
    result = {
        "success": True,
        "assignments": assignments,
        "weights": final_weights,
        "metadata": {
            "region_seed": seed,
            "tuning_iterations": state.get("iterations", 0),
            "satisfaction_score": ts,
            "eligible_rules": te,
            "fairness_index": fair_idx,
            "combined_score": combined_score,
        }
    }
    
    return result


def run_single_ladder(args: Tuple) -> Dict[str, Any]:
    """
    Worker function to run a single ladder search (original implementation).
    Args is a tuple to be compatible with multiprocessing.Pool.map.
    Tuple: (payload, weights, shots, time_limit, workers, seed, fairness_weight)
    """
    payload, weights, shots, time_limit, workers, seed, fairness_weight = args
    
    # Extract rules for scoring
    all_rules = payload.get("roleRules", [])
    crew_rules = [r for r in all_rules if r.get("source") == "crew"]
    crew = payload.get("crew", [])
    
    best_score = -1.0
    best_result = None
    previous_solution_hint = None
    
    current_seed = seed
    
    for shot in range(shots):
        # Run solver
        res = solve(
            payload,
            time_limit_seconds=time_limit,
            weights=weights,
            random_seed=current_seed,
            num_workers=workers,
            solution_hint=previous_solution_hint
        )
        
        if res.get("success"):
            # Score it
            ts, te = satisfaction_counts(res.get("assignments", []), crew_rules, crew)
            pc = per_crew_satisfaction(res.get("assignments", []), crew_rules, crew)
            _, _, _, fair_idx = fairness_stats(pc)
            
            combined_score = ts + (fairness_weight * fair_idx)
            
            if combined_score > best_score:
                best_score = combined_score
                best_result = res
                previous_solution_hint = res.get("assignments")
                
                # Add metadata to result about which shot found it
                if "metadata" not in best_result:
                    best_result["metadata"] = {}
                best_result["metadata"]["ladder_shot"] = shot + 1
                best_result["metadata"]["ladder_score"] = combined_score
                best_result["metadata"]["ladder_seed"] = seed
        
        if current_seed is not None:
            current_seed += 1

    return best_result


def run_parallel_tuning_regions(
    payload: Dict[str, Any],
    initial_weights: Dict[int, float],
    num_regions: int = 10,
    tuning_iterations: int = 5,
    time_limit_per_solve: int = 10,
    fairness_weight: float = 0.5,
) -> Dict[str, Any]:
    """
    Run multiple independent TUNING LOOPS in parallel.
    
    Each region:
    - Uses a different random seed → explores different solution space
    - Runs its own tuning loop → adjusts weights based on violations
    - Returns the best schedule found with tuned weights
    
    This combines the benefits of:
    - Weight tuning (prioritizing violated preferences)
    - Parallel exploration (different random starting points)
    
    Args:
        payload: Solver input
        initial_weights: Starting weights (usually all 1.0)
        num_regions: Number of parallel tuning regions
        tuning_iterations: Max iterations per region's tuning loop
        time_limit_per_solve: Seconds per solver call
        fairness_weight: Weight for fairness in combined score
        
    Returns:
        Best result across all regions (with tuned weights)
    """
    
    # Generate random seeds for each region
    rng = random.Random()
    region_seeds = [rng.randint(1, 1_000_000) for _ in range(num_regions)]
    
    tasks = []
    for seed in region_seeds:
        tasks.append((
            payload,
            initial_weights,
            tuning_iterations,
            time_limit_per_solve,
            seed,
            fairness_weight
        ))
    
    print(f"🚀 Launching {num_regions} parallel TUNING regions...", file=sys.stderr)
    print(f"   Config: {tuning_iterations} tuning iterations/region, {time_limit_per_solve}s/solve", file=sys.stderr)
    
    best_global_score = -1.0
    best_global_result = None
    
    with multiprocessing.Pool(processes=num_regions) as pool:
        results = pool.map(run_single_tuning_region, tasks)
        
        for res in results:
            if res and res.get("success"):
                score = res.get("metadata", {}).get("combined_score", 0)
                
                if score > best_global_score:
                    best_global_score = score
                    best_global_result = res
    
    if best_global_result:
        meta = best_global_result.get("metadata", {})
        print(f"🏆 Best result from Region (Seed {meta.get('region_seed')})", file=sys.stderr)
        print(f"   Satisfaction: {meta.get('satisfaction_score')}/{meta.get('eligible_rules')}", file=sys.stderr)
        print(f"   Fairness: {meta.get('fairness_index', 0):.1f}", file=sys.stderr)
        print(f"   Combined Score: {best_global_score:.2f}", file=sys.stderr)
    else:
        print("❌ No successful result found in any region.", file=sys.stderr)
        
    return best_global_result

def run_parallel_regions(
    payload: Dict[str, Any],
    weights: Dict[int, float],
    num_regions: int,
    shots_per_region: int,
    time_limit_per_shot: int,
    workers_per_region: int,
    fairness_weight: float = 0.5
) -> Dict[str, Any]:
    """
    Run multiple independent Ladder searches in parallel.
    """
    
    # Prepare arguments for each region
    # We generate random seeds for each region to ensure they explore different parts of the space
    rng = random.Random()
    region_seeds = [rng.randint(1, 1_000_000) for _ in range(num_regions)]
    
    tasks = []
    for seed in region_seeds:
        tasks.append((
            payload,
            weights,
            shots_per_region,
            time_limit_per_shot,
            workers_per_region,
            seed,
            fairness_weight
        ))
    
    print(f"🚀 Launching {num_regions} parallel regions (Ladder Search)...", file=sys.stderr)
    print(f"   Config: {shots_per_region} shots/region, {time_limit_per_shot}s/shot, {workers_per_region} workers/region", file=sys.stderr)
    
    best_global_score = -1.0
    best_global_result = None
    
    # Use multiprocessing Pool
    # Note: We use 'spawn' or 'fork' depending on OS, but standard Pool usually works.
    # For heavy objects like payload, passing them might be slow, but for 5-10 regions it's negligible compared to solve time.
    with multiprocessing.Pool(processes=num_regions) as pool:
        results = pool.map(run_single_ladder, tasks)
        
        # Aggregate results
        all_rules = payload.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        crew = payload.get("crew", [])
        
        for res in results:
            if res and res.get("success"):
                ts, te = satisfaction_counts(res.get("assignments", []), crew_rules, crew)
                pc = per_crew_satisfaction(res.get("assignments", []), crew_rules, crew)
                _, _, _, fair_idx = fairness_stats(pc)
                
                combined_score = ts + (fairness_weight * fair_idx)
                
                if combined_score > best_global_score:
                    best_global_score = combined_score
                    best_global_result = res
    
    if best_global_result:
        print(f"🏆 Best result found in Region (Seed {best_global_result.get('metadata', {}).get('ladder_seed')})", file=sys.stderr)
        print(f"   Score: {best_global_score:.2f}", file=sys.stderr)
    else:
        print("❌ No successful result found in any region.", file=sys.stderr)
        
    return best_global_result
