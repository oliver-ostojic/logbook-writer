"""Module 1: The Driver (MVP).

Responsibilities:
- Vectorize schedule into satisfaction vector
- Calculate global score
- Naïve tuning (increase weight on unsatisfied rules)
- Run the core tuning loop
"""

from __future__ import annotations

from typing import Any, Dict, List

from .rule_evaluator import evaluate_all_rules, evaluate_rules_to_vector
from .stabilizer import classify_rules, damped_tune, damped_tune_with_conflicts, detect_conflicts, hamming_distance
from .types import CrewRoleRuleRecord, TuningState
from .optimizer import (
    AnnealingConfig,
    LockDetectorConfig,
    LockedRule,
    FairnessConfig,
    should_accept_worse_move,
    detect_unsatisfiable_rules,
    apply_weight_updates_with_locks,
    format_locked_rules_report,
    apply_fairness_to_weight_deltas,
    compute_gini_coefficient,
    compute_per_crew_satisfaction,
)


# ---------------------------------------------------------------------------
# Vectorizer: schedule + rules -> satisfaction vector
# ---------------------------------------------------------------------------


def vectorize_satisfaction(
    assignments: List[Dict[str, Any]],
    rules: List[CrewRoleRuleRecord],
    crew: List[Dict[str, Any]] | None = None,
) -> List[int]:
    """Convert solver assignments into a binary satisfaction vector.

    Returns a list of 0s and 1s, one per rule, in the same order as `rules`.

    Uses rule_evaluator to compute satisfaction for each rule.
    """
    if crew is None:
        crew = []
    
    return evaluate_rules_to_vector(rules, assignments, crew)


# ---------------------------------------------------------------------------
# Global Score
# ---------------------------------------------------------------------------


def global_score(satisfaction: List[int], weights: Dict[int, float], rules: List[CrewRoleRuleRecord]) -> float:
    """Calculate weighted satisfaction score over ELIGIBLE rules only.

    Score = sum(S_i * W_i) / sum(W_i)  for eligible rules only
    
    Ineligible rules (satisfaction = -1) are excluded from the calculation.
    This ensures we only measure satisfaction of rules that actually apply.

    Args:
        satisfaction: vector aligned with rules (-1=ineligible, 0=violated, 1=satisfied)
        weights: dict mapping rule_id -> weight
        rules: list of rule records (to get rule_id ordering)

    Returns:
        Weighted average satisfaction in [0, 1].
    """
    if not rules:
        return 1.0  # vacuously satisfied

    total_weight = 0.0
    weighted_sum = 0.0

    for i, rule in enumerate(rules):
        s = satisfaction[i] if i < len(satisfaction) else 0
        
        # Skip ineligible rules (they don't apply to this schedule)
        if s == -1:
            continue
            
        rule_id = rule.get("id", i)
        w = weights.get(rule_id, 1.0)
        weighted_sum += s * w
        total_weight += w

    if total_weight <= 0:
        return 1.0

    return weighted_sum / total_weight


# ---------------------------------------------------------------------------
# Naïve Tuning (Module 1 baseline)
# ---------------------------------------------------------------------------


def naive_tune(
    satisfaction: List[int],
    weights: Dict[int, float],
    rules: List[CrewRoleRuleRecord],
    step: float = 0.5,
) -> Dict[int, float]:
    """Increase weight on every unsatisfied rule by a fixed step.

    Skips ineligible rules (satisfaction = -1).
    Returns updated weights dict.
    """
    new_weights = dict(weights)
    for i, rule in enumerate(rules):
        s = satisfaction[i] if i < len(satisfaction) else 0
        # Skip ineligible rules (-1) - only tune violated rules (0)
        if s == 0:
            rule_id = rule.get("id", i)
            new_weights[rule_id] = new_weights.get(rule_id, 1.0) + step
    return new_weights


# ---------------------------------------------------------------------------
# Tuning Loop (placeholder)
# ---------------------------------------------------------------------------


def run_tuning_loop(
    payload: Dict[str, Any],
    solver_fn,  # Callable[[payload, weights], result]
    *,
    max_iterations: int = 10,
    min_iterations: int = 1,
    min_improvement: float = 0.01,
    use_momentum: bool = True,
    use_conflict_resolution: bool = False,  # Enable conflict-aware damping
    use_annealing: bool = False,  # Enable simulated annealing
    use_locking: bool = False,  # Enable dead-end detection + locking
    use_fairness: bool = False,  # Enable fairness-weighted tuning (Module 3)
    use_volatility_rejection: bool = False,  # Enable volatility rejection (Module 2.2)
    volatility_threshold: float = 0.10,  # Reject if Hamming > 10% of rules
    annealing_config: AnnealingConfig | None = None,
    lock_config: LockDetectorConfig | None = None,
    fairness_config: FairnessConfig | None = None,
    beta: float = 0.5,
    learning_rate: float = 1.0,
    stuck_threshold: int = 3,
    initial_weights: Dict[int, float] | None = None,
    return_last_weights: bool = False,  # If True, return last weights instead of best
) -> TuningState:
    """Run the full tuning loop.

    Args:
        payload: solver input payload (must include roleRules)
        solver_fn: function(payload, weights) -> solver result with 'assignments'
        max_iterations: safety limit
        min_iterations: minimum iterations before convergence check (for analysis)
        min_improvement: break if score improves less than this
        use_momentum: if True, use momentum-based tuning; else naive
        use_conflict_resolution: if True, detect conflicts and apply damping to lower-priority rules
        beta: momentum coefficient (0.9 = high momentum)
        learning_rate: step size for momentum updates
        stuck_threshold: iterations of failure before classifying as STUCK
        initial_weights: Optional starting weights (e.g. from Oracle)
        return_last_weights: If True, return last (tuned) weights; else return best weights

    Returns:
        Final TuningState with weights, history, locked rules, etc.
    """
    all_rules: List[CrewRoleRuleRecord] = list(payload.get("roleRules") or [])
    
    # IMPORTANT: Only tune CrewRoleRules (source='crew')
    # StoreRoleRules (source='store') are hard constraints, not tuneable preferences
    rules: List[CrewRoleRuleRecord] = [
        r for r in all_rules if r.get("source") == "crew"
    ]
    
    if not rules:
        # Fallback: if no source field, use all rules (backwards compatibility)
        rules = all_rules

    # Initialize weights
    if initial_weights:
        # Use provided weights, defaulting to 1.0 for any missing rules
        weights: Dict[int, float] = {
            rule.get("id", i): initial_weights.get(rule.get("id", i), 1.0)
            for i, rule in enumerate(rules)
        }
    else:
        # Default to 1.0
        weights: Dict[int, float] = {rule.get("id", i): 1.0 for i, rule in enumerate(rules)}
    
    initial_weights_snapshot: Dict[int, float] = dict(weights)  # Save for lock detection
    
    # Initialize velocities to 0.0 (for momentum)
    velocities: Dict[int, float] = {rule.get("id", i): 0.0 for i, rule in enumerate(rules)}

    # Module 4: Annealing and locking config
    anneal_cfg = annealing_config or AnnealingConfig()
    lock_cfg = lock_config or LockDetectorConfig()
    fair_cfg = fairness_config or FairnessConfig()
    locked_rule_ids: set[int] = set()
    locked_rules_list: List[LockedRule] = []

    state: TuningState = {
        "iteration": 0,
        "weights": weights,
        "velocities": velocities,
        "satisfaction_history": [],
        "locked_rules": [],
        "rule_classifications": {},
        "converged": False,
    }

    prev_score = 0.0
    crew = payload.get("crew", [])

    # Track best result across all iterations
    best_satisfied = 0
    best_iteration = 0
    best_weights: Dict[int, float] = dict(weights)
    best_velocities: Dict[int, float] = dict(velocities)

    for iteration in range(max_iterations):
        state["iteration"] = iteration

        # Run solver with current weights
        result = solver_fn(payload, weights)
        assignments = result.get("assignments", [])

        # Vectorize
        satisfaction = vectorize_satisfaction(assignments, rules, crew)
        state["satisfaction_history"].append(satisfaction)
        
        # Count satisfied (eligible only)
        satisfied_count = sum(1 for s in satisfaction if s == 1)
        
        # Track best result
        if satisfied_count > best_satisfied:
            best_satisfied = satisfied_count
            best_iteration = iteration
            best_weights = dict(weights)
            best_velocities = dict(velocities)

        # Classify rules based on history (Module 2 analysis)
        if len(state["satisfaction_history"]) >= 2:
            classifications = classify_rules(
                state["satisfaction_history"],
                rules,
            )
            state["rule_classifications"] = classifications

        # Score
        score = global_score(satisfaction, weights, rules)

        # Check convergence (only after min_iterations)
        improvement = score - prev_score
        if iteration >= min_iterations and improvement < min_improvement:
            state["converged"] = True
            break

        prev_score = score

        # Tune: momentum (with or without conflict resolution) or naive
        if use_momentum:
            if use_conflict_resolution and len(state["satisfaction_history"]) >= 3:
                # Detect conflicts from history
                conflicts = detect_conflicts(
                    state["satisfaction_history"],
                    rules,
                    threshold=-0.5,
                )
                # Use conflict-aware damped tuning
                proposed_weights, proposed_velocities, dampings = damped_tune_with_conflicts(
                    satisfaction=satisfaction,
                    weights=weights,
                    velocities=velocities,
                    rules=rules,
                    conflicts=conflicts,
                    history=state["satisfaction_history"],
                    beta=beta,
                    learning_rate=learning_rate,
                )
                state["conflict_dampings"] = dampings
                state["conflicts_detected"] = len(conflicts)
            else:
                # Regular momentum tuning (no conflict info yet or disabled)
                proposed_weights, proposed_velocities = damped_tune(
                    satisfaction=satisfaction,
                    weights=weights,
                    velocities=velocities,
                    rules=rules,
                    history=state["satisfaction_history"],
                    beta=beta,
                    learning_rate=learning_rate,
                )
        else:
            proposed_weights = naive_tune(satisfaction, weights, rules)
            proposed_velocities = velocities  # No velocity update for naive

        # Module 2.2: Volatility Rejection - reject chaotic weight updates
        if use_volatility_rejection and len(state["satisfaction_history"]) >= 2:
            prev_satisfaction = state["satisfaction_history"][-2]
            # Only compare eligible rules (filter out -1s)
            curr_eligible = [s for s in satisfaction if s >= 0]
            prev_eligible = [s for s in prev_satisfaction if s >= 0]
            
            if curr_eligible and prev_eligible and len(curr_eligible) == len(prev_eligible):
                hamming = hamming_distance(curr_eligible, prev_eligible)
                volatility_ratio = hamming / len(curr_eligible) if curr_eligible else 0
                
                state["volatility_hamming"] = hamming
                state["volatility_ratio"] = volatility_ratio
                
                if volatility_ratio > volatility_threshold:
                    # Too volatile - reject this iteration's proposed updates
                    proposed_weights = dict(weights)
                    proposed_velocities = dict(velocities)
                    state["volatility_rejected"] = True
                else:
                    state["volatility_rejected"] = False

        # Module 3: Fairness - adjust weight updates based on per-crew satisfaction
        if use_fairness:
            # Compute weight deltas (proposed - current)
            weight_deltas = {rid: proposed_weights[rid] - weights[rid] for rid in proposed_weights}
            
            # Apply fairness multipliers
            adjusted_deltas, fairness_report = apply_fairness_to_weight_deltas(
                weight_deltas=weight_deltas,
                rules=rules,
                satisfaction_vector=satisfaction,
                config=fair_cfg,
            )
            
            # Apply adjusted deltas to get new proposed weights
            for rid, delta in adjusted_deltas.items():
                proposed_weights[rid] = weights[rid] + delta
            
            # Store fairness report in state
            state["fairness_gini"] = fairness_report["gini"]
            state["fairness_spread"] = fairness_report["spread"]
            state["fairness_min_pct"] = fairness_report["min_pct"]
            state["fairness_max_pct"] = fairness_report["max_pct"]
            state["fairness_bottom_crew"] = fairness_report["bottom_crew"]
            state["fairness_top_crew"] = fairness_report["top_crew"]

        # Module 4: Annealing - occasionally accept worse moves early on
        if use_annealing:
            temperature = anneal_cfg.temperature_at(iteration)
            proposed_score = global_score(satisfaction, proposed_weights, rules)
            delta = proposed_score - score
            if not should_accept_worse_move(delta, temperature):
                # Reject the proposed update, keep current weights/velocities
                proposed_weights = dict(weights)
                proposed_velocities = dict(velocities)
            state["annealing_temperature"] = temperature

        # Module 4: Lock detection - find and freeze unsatisfiable rules
        if use_locking:
            new_locks = detect_unsatisfiable_rules(
                satisfaction_history=state["satisfaction_history"],
                rules=rules,
                weights=proposed_weights,
                initial_weights=initial_weights,
                config=lock_cfg,
                already_locked=locked_rule_ids,
                current_iteration=iteration,
            )
            for lr in new_locks:
                locked_rule_ids.add(lr.rule_id)
                locked_rules_list.append(lr)
            
            # Apply updates but skip locked rules
            weights, velocities = apply_weight_updates_with_locks(
                proposed_weights=proposed_weights,
                proposed_velocities=proposed_velocities,
                locked_rule_ids=locked_rule_ids,
                current_weights=weights,
                current_velocities=velocities,
            )
        else:
            weights = proposed_weights
            velocities = proposed_velocities
        
        state["weights"] = weights
        state["velocities"] = velocities

    # Return best or last weights based on flag
    if not return_last_weights:
        # Default: return BEST weights found
        state["weights"] = best_weights
        state["velocities"] = best_velocities
    # else: keep the last weights already in state
    
    state["best_iteration"] = best_iteration
    state["best_satisfied"] = best_satisfied
    state["final_iteration"] = state["iteration"]  # Track which iteration we ended on
    
    # Module 4: Include locked rules in final state
    if use_locking:
        state["locked_rules"] = [lr.to_dict() for lr in locked_rules_list]
        state["locked_rules_report"] = format_locked_rules_report(locked_rules_list)

    return state
