"""Test tuning driver with real solver input for 12/25/2025.

This script:
1. Fetches solver input from the API for store 768 on 12/25
2. Runs the tuning loop with the real payload
3. Reports satisfaction and weight changes
"""

import json
import random
import sys
import urllib.request
import urllib.error
from typing import Any, Dict

# Add paths
sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop, vectorize_satisfaction, global_score
from tuning_engine.satisfaction_calculator import calculate_satisfaction
from tuning_engine.stabilizer import detect_conflicts, print_conflict_report, apply_conflict_resolution


# Configuration
STORE_ID = "768"
DATE = "2025-11-25"
API_BASE = "http://localhost:4000"
MAX_ITERATIONS = 15  # Start with 15 - enough to see convergence patterns
TIME_LIMIT_PER_SOLVE = 10  # seconds

# Generate a random seed once for the entire tuning session
# This makes the solver deterministic within a session, so we can measure real tuning effects
# SOLVER_SEED = random.randint(1, 1_000_000)
SOLVER_SEED = 42  # Fixed for testing determinism


CACHE_FILE = "cached_solver_input.json"

def fetch_solver_input(store_id: str, date: str) -> Dict[str, Any]:
    """Fetch solver input from the API (with local caching for determinism)."""
    import os
    
    # Use cached file if it exists (for deterministic testing)
    if os.path.exists(CACHE_FILE):
        print(f"📂 Loading cached solver input from: {CACHE_FILE}")
        with open(CACHE_FILE) as f:
            return json.load(f)
    
    url = f"{API_BASE}/solver/v2/input?storeId={store_id}&date={date}"
    print(f"🔍 Fetching solver input from: {url}")
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            
        if not result.get("success"):
            raise Exception(f"API error: {result.get('error', 'unknown')}")
        
        # Cache for next run
        with open(CACHE_FILE, 'w') as f:
            json.dump(result["data"], f)
        print(f"💾 Cached solver input to: {CACHE_FILE}")
            
        return result["data"]
    except urllib.error.URLError as e:
        raise Exception(f"Failed to connect to API: {e}")


def solver_wrapper(payload: Dict[str, Any], weights: Dict[int, float]) -> Dict[str, Any]:
    """Wrapper that calls solve() with weights and consistent random seed."""
    return solve(payload, time_limit_seconds=TIME_LIMIT_PER_SOLVE, weights=weights, random_seed=SOLVER_SEED)


def print_rule_summary(rules, satisfaction, weights):
    """Print a summary of rules, their satisfaction, and weights."""
    print(f"\n{'Rule ID':<8} {'Type':<35} {'Crew':<12} {'Sat':<5} {'Weight':<8}")
    print("-" * 75)
    
    for i, rule in enumerate(rules):
        rule_id = rule.get("id", i)
        rule_type = rule.get("type", "UNKNOWN")[:34]
        crew_id = str(rule.get("crewId", "ALL"))[:11]
        sat = satisfaction[i] if i < len(satisfaction) else "?"
        weight = weights.get(rule_id, 1.0)
        
        sat_icon = "✓" if sat == 1 else "✗" if sat == 0 else "?"
        print(f"{rule_id:<8} {rule_type:<35} {crew_id:<12} {sat_icon:<5} {weight:<8.2f}")


def main():
    print("=" * 70)
    print(f"TUNING DRIVER TEST - Store {STORE_ID} on {DATE}")
    print("=" * 70)
    print(f"🎲 Using random seed: {SOLVER_SEED} (deterministic within this run)")
    
    # Step 1: Fetch solver input
    try:
        payload = fetch_solver_input(STORE_ID, DATE)
    except Exception as e:
        print(f"\n❌ Failed to fetch solver input: {e}")
        print("\nMake sure the API is running: pnpm run dev (in apps/api)")
        return False
    
    # Print payload summary
    crew = payload.get("crew", [])
    roles = payload.get("roles", [])
    all_rules = payload.get("roleRules", [])
    coverage = payload.get("coverageWindows", [])
    
    # Filter to CrewRoleRules only (source: 'crew')
    rules = [r for r in all_rules if r.get("source") == "crew"]
    store_rules = [r for r in all_rules if r.get("source") == "store"]
    
    print(f"\n📊 Payload Summary:")
    print(f"   Crew members: {len(crew)}")
    print(f"   Roles: {len(roles)}")
    print(f"   Total Role Rules: {len(all_rules)}")
    print(f"   CrewRoleRules: {len(rules)}")
    print(f"   StoreRoleRules: {len(store_rules)}")
    print(f"   Coverage Windows: {len(coverage)}")
    
    if not rules:
        print("\n⚠️  No role rules found - nothing to tune!")
        return True
    
    # Count rules by type
    rule_types = {}
    for rule in rules:
        t = rule.get("type", "UNKNOWN")
        rule_types[t] = rule_types.get(t, 0) + 1
    
    print(f"\n   Rules by type:")
    for t, count in sorted(rule_types.items()):
        print(f"      {t}: {count}")
    
    # Step 2: Run initial solve (no tuning)
    print(f"\n" + "=" * 70)
    print("INITIAL SOLVE (weights = 1.0)")
    print("=" * 70)
    
    initial_weights = {rule.get("id", i): 1.0 for i, rule in enumerate(rules)}
    initial_result = solver_wrapper(payload, initial_weights)
    
    if not initial_result.get("success"):
        print(f"\n❌ Initial solve failed: {initial_result.get('metadata', {}).get('status')}")
        return False
    
    assignments = initial_result.get("assignments", [])
    print(f"\n✅ Initial solve succeeded: {len(assignments)} assignments")
    
    # Calculate initial satisfaction
    initial_sat = vectorize_satisfaction(assignments, rules, crew)
    initial_score = global_score(initial_sat, initial_weights, rules)
    
    # Count eligible vs ineligible rules
    eligible_count = sum(1 for s in initial_sat if s >= 0)
    ineligible_count = sum(1 for s in initial_sat if s == -1)
    satisfied = sum(1 for s in initial_sat if s == 1)
    violated = sum(1 for s in initial_sat if s == 0)
    total = len(initial_sat)
    
    if eligible_count > 0:
        print(f"   Total crew rules: {total}")
        print(f"   Eligible (applicable today): {eligible_count}")
        print(f"   Ineligible (N/A - crew not assigned role): {ineligible_count}")
        print(f"   Satisfied: {satisfied}/{eligible_count} ({100*satisfied/eligible_count:.1f}%)")
        print(f"   Violated: {violated}/{eligible_count}")
        print(f"   Initial score: {initial_score:.3f}")
    else:
        print(f"   ⚠️  No eligible rules (possibly no crew or assignments)")
        print(f"   Initial score: {initial_score:.3f}")
    
    # Step 3: Run tuning loop
    print(f"\n" + "=" * 70)
    print(f"TUNING LOOP (max {MAX_ITERATIONS} iterations) - WITH CONFLICT RESOLUTION")
    print("=" * 70)
    
    # Pass full payload to tuning loop - it needs all rules for solver
    # The driver internally filters to crew rules for weight tuning
    # (see driver.py lines 128-133)
    
    # PARAMETER TEST: Using slower learning rate (0.15 instead of 0.3)
    state = run_tuning_loop(
        payload,  # Full payload - solver needs ALL rules to build valid schedule
        solver_wrapper,
        max_iterations=MAX_ITERATIONS,
        min_iterations=5,  # Force at least 5 for conflict detection
        min_improvement=0.001,  # Lower threshold to allow more iterations
        use_conflict_resolution=True,  # Enable conflict-aware damping!
        learning_rate=0.15,  # CHANGED: Slower learning (was 0.3)
        beta=0.9,  # Keep momentum the same
    )
    
    # Step 4: Report results
    print(f"\n📈 Tuning Results:")
    print(f"   Iterations: {state['iteration'] + 1}")
    print(f"   Converged: {state['converged']}")
    
    # Show best iteration info
    best_iter = state.get('best_iteration', 0)
    best_satisfied = state.get('best_satisfied', 0)
    print(f"   🏆 BEST: {best_satisfied} satisfied at iteration {best_iter} (weights saved from this point)")
    
    # Show score progression (with eligibility counts)
    print(f"\n   Score progression:")
    for i, sat in enumerate(state['satisfaction_history']):
        score = global_score(sat, state['weights'], rules)
        eligible = sum(1 for s in sat if s >= 0)
        satisfied = sum(1 for s in sat if s == 1)
        marker = " 🏆" if i == best_iter else ""
        print(f"      Iter {i}: {satisfied}/{eligible} satisfied, score={score:.4f}{marker}")
    
    # Final satisfaction - now using BEST weights
    print(f"\n   ✅ Using weights from BEST iteration ({best_iter}), not last iteration")
    print(f"   Best satisfied: {best_satisfied} rules")
    
    # Get the satisfaction from best iteration for analysis
    best_sat = state['satisfaction_history'][best_iter] if state['satisfaction_history'] else []
    best_eligible = sum(1 for s in best_sat if s >= 0)
    
    # Show weight changes
    changed_weights = {
        rule_id: weight 
        for rule_id, weight in state['weights'].items() 
        if weight != 1.0
    }
    
    if changed_weights:
        print(f"\n   Weight changes ({len(changed_weights)} rules):")
        for rule_id, weight in sorted(changed_weights.items(), key=lambda x: -x[1])[:10]:
            # Find rule type
            rule = next((r for r in rules if r.get("id") == rule_id), {})
            rule_type = rule.get("type", "?")[:25]
            print(f"      Rule {rule_id} ({rule_type}): {weight:.2f}")
        if len(changed_weights) > 10:
            print(f"      ... and {len(changed_weights) - 10} more")
    
    # UNSATISFIED RULES ANALYSIS
    print(f"\n" + "=" * 70)
    print("UNSATISFIED RULES ANALYSIS")
    print("=" * 70)
    
    # Separate unsatisfied (0) from ineligible (-1) using BEST iteration
    unsatisfied_rules = []
    ineligible_rules = []
    for i, rule in enumerate(rules):
        if i < len(best_sat):
            if best_sat[i] == 0:
                unsatisfied_rules.append(rule)
            elif best_sat[i] == -1:
                ineligible_rules.append(rule)
    
    # Group by type
    unsat_by_type = {}
    for rule in unsatisfied_rules:
        t = rule.get("type", "UNKNOWN")
        if t not in unsat_by_type:
            unsat_by_type[t] = []
        unsat_by_type[t].append(rule)
    
    print(f"\n   Total unsatisfied: {len(unsatisfied_rules)}/{best_eligible} eligible rules")
    print(f"   (Ineligible/N/A rules not counted: {len(ineligible_rules)})")
    print(f"\n   By rule type:")
    for rule_type, type_rules in sorted(unsat_by_type.items(), key=lambda x: -len(x[1])):
        print(f"      {rule_type}: {len(type_rules)} unsatisfied")
    
    # Show specific unsatisfied rules (top 20)
    print(f"\n   Top unsatisfied rules (showing up to 20):")
    print(f"   {'ID':<8} {'Type':<30} {'Crew':<12} {'RoleCode':<12}")
    print("   " + "-" * 65)
    for rule in unsatisfied_rules[:20]:
        rule_id = rule.get("id", "?")
        rule_type = rule.get("type", "?")[:29]
        crew_id = str(rule.get("crewId", "?"))[:11]
        role_code = str(rule.get("roleCode", "?"))[:11]
        print(f"   {rule_id:<8} {rule_type:<30} {crew_id:<12} {role_code:<12}")
    
    if len(unsatisfied_rules) > 20:
        print(f"   ... and {len(unsatisfied_rules) - 20} more")
    
    # CONFLICT DETECTION
    print(f"\n" + "=" * 70)
    print("CONFLICT DETECTION")
    print("=" * 70)
    
    if len(state['satisfaction_history']) >= 3:
        conflicts = detect_conflicts(
            state['satisfaction_history'],
            rules,
            threshold=-0.5,  # Strong negative correlation
            min_samples=3,
        )
        print_conflict_report(conflicts, max_display=15)
        
        # CONFLICT RESOLUTION
        if conflicts:
            print(f"\n" + "=" * 70)
            print("CONFLICT RESOLUTION - Re-solve with adjusted weights")
            print("=" * 70)
            
            # First, get a consistent "before" measurement using crew rules only
            # Re-solve with current tuned weights
            before_result = solver_wrapper(payload, state['weights'])
            before_assignments = before_result.get("assignments", [])
            before_sat = vectorize_satisfaction(before_assignments, rules, crew)
            before_score = global_score(before_sat, state['weights'], rules)
            
            # Debug: show what we're working with
            print(f"\n   DEBUG: {len(before_assignments)} assignments from before solve")
            print(f"   DEBUG: {len(before_sat)} satisfaction values (should be ~{len(rules)} crew rules)")
            print(f"   DEBUG: {sum(before_sat)}/{len(before_sat)} satisfied before conflict resolution")
            
            # Apply conflict resolution to cap weights of conflicting rules
            # Use lower cap since momentum tuning produces smaller weights (~1.3)
            resolved_weights, num_adjusted = apply_conflict_resolution(
                state['weights'],
                conflicts,
                strategy="cap",
                cap_weight=1.2,  # Cap at 1.2 (momentum weights are ~1.3)
            )
            
            print(f"\n   Strategy: CAP (limit conflicting rules to max weight 1.2)")
            print(f"   Adjusted {num_adjusted} rule weights")
            
            if num_adjusted > 0:
                # Re-solve with conflict-resolved weights
                resolved_result = solver_wrapper(payload, resolved_weights)
                if resolved_result.get("success"):
                    resolved_assignments = resolved_result.get("assignments", [])
                    resolved_sat = vectorize_satisfaction(resolved_assignments, rules, crew)
                    resolved_score = global_score(resolved_sat, resolved_weights, rules)
                    
                    # Compare properly - both evaluations using same crew rules
                    satisfied_before = sum(before_sat)
                    satisfied_after = sum(resolved_sat)
                    total_rules = len(rules)
                    
                    print(f"\n   Before resolution: {satisfied_before}/{total_rules} satisfied ({100*satisfied_before/total_rules:.1f}%)")
                    print(f"   After resolution:  {satisfied_after}/{total_rules} satisfied ({100*satisfied_after/total_rules:.1f}%)")
                    print(f"   Score: {before_score:.4f} → {resolved_score:.4f}")
                    
                    if satisfied_after > satisfied_before:
                        print(f"\n   ✅ Conflict resolution helped! +{satisfied_after - satisfied_before} rules satisfied")
                    elif satisfied_after < satisfied_before:
                        print(f"\n   ⚠️  Conflict resolution reduced satisfaction by {satisfied_before - satisfied_after} rules")
                    else:
                        print(f"\n   ➖ No change in satisfaction count")
                else:
                    print(f"\n   ❌ Re-solve failed after conflict resolution")
            else:
                print(f"\n   ℹ️  No weights needed adjustment (all below cap)")
    else:
        print(f"\n   ⚠️  Not enough iterations for conflict detection (need >= 3)")
    
    print(f"\n" + "=" * 70)
    print("✅ TUNING TEST COMPLETE")
    print("=" * 70)
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
