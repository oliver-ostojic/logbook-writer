"""Module 4: Optimizer Intelligence.

This module provides:
1. Simulated Annealing: Temperature-based acceptance to escape local optima
2. Dead-end Detection: Identify rules that are always eligible but never satisfied
3. Lock/Freeze Mechanism: Permanently freeze weights for unsatisfiable rules

These are "escape hatches" for when basic tuning gets stuck or wastes iterations.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple


# ---------------------------------------------------------------------------
# Annealing
# ---------------------------------------------------------------------------

@dataclass
class AnnealingConfig:
    """Configuration for simulated annealing."""
    
    initial_temperature: float = 1.0  # Starting temperature
    cooling_rate: float = 0.92  # Multiplicative decay per iteration
    min_temperature: float = 0.01  # Stop annealing below this
    
    def temperature_at(self, iteration: int) -> float:
        """Get temperature for a given iteration."""
        t = self.initial_temperature * (self.cooling_rate ** iteration)
        return max(t, self.min_temperature)


def should_accept_worse_move(
    delta_score: float,
    temperature: float,
    rng: Optional[random.Random] = None,
) -> bool:
    """Decide whether to accept a move that decreases the score.
    
    Uses Metropolis criterion: accept with probability exp(delta / T).
    
    Args:
        delta_score: new_score - old_score (negative if worse)
        temperature: current annealing temperature
        rng: optional Random instance for reproducibility
    
    Returns:
        True if we should accept the worse move.
    """
    if delta_score >= 0:
        return True  # Always accept improvements
    
    if temperature <= 0:
        return False  # No annealing at zero temperature
    
    # Metropolis acceptance probability
    prob = math.exp(delta_score / temperature)
    
    if rng is None:
        return random.random() < prob
    return rng.random() < prob


# ---------------------------------------------------------------------------
# Dead-End / Unsatisfiable Rule Detection
# ---------------------------------------------------------------------------

class LockReason(Enum):
    """Reason why a rule was locked/frozen."""
    
    ALWAYS_UNSATISFIED = "always_unsatisfied"
    WEIGHT_CEILING_HIT = "weight_ceiling_hit"
    HARD_CONFLICT = "hard_conflict"


@dataclass
class LockedRule:
    """Record of a locked/frozen rule."""
    
    rule_id: int
    rule_type: str
    crew_id: str
    role_code: str
    reason: LockReason
    locked_at_iteration: int
    frozen_weight: float
    evidence: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "ruleId": self.rule_id,
            "ruleType": self.rule_type,
            "crewId": self.crew_id,
            "roleCode": self.role_code,
            "reason": self.reason.value,
            "lockedAtIteration": self.locked_at_iteration,
            "frozenWeight": self.frozen_weight,
            "evidence": self.evidence,
        }


@dataclass
class LockDetectorConfig:
    """Configuration for dead-end detection."""
    
    # How many consecutive iterations of failure before considering lock
    window_size: int = 5
    
    # Minimum eligibility ratio over the window (1.0 = always eligible)
    min_eligible_ratio: float = 0.8
    
    # Must have 0 satisfied count over the window
    require_zero_satisfied: bool = True
    
    # Require weight to have grown by this factor (e.g., 1.5 = 50% growth)
    # Set to None to disable weight-growth check
    min_weight_growth: Optional[float] = 1.3
    
    # Maximum weight before auto-locking (prevents runaway)
    weight_ceiling: float = 10.0


def detect_unsatisfiable_rules(
    satisfaction_history: List[List[int]],
    rules: List[Dict[str, Any]],
    weights: Dict[int, float],
    initial_weights: Dict[int, float],
    config: LockDetectorConfig,
    already_locked: Set[int],
    current_iteration: int,
) -> List[LockedRule]:
    """Detect rules that appear unsatisfiable and should be locked.
    
    A rule is flagged as UNSAT_CANDIDATE if over the last `window_size` iterations:
    - It was eligible at least `min_eligible_ratio` of the time
    - It was satisfied exactly 0 times
    - (Optional) Its weight has grown by at least `min_weight_growth`
    
    Also flags rules that hit the weight ceiling.
    
    Args:
        satisfaction_history: list of satisfaction vectors per iteration
        rules: list of rule records
        weights: current weights
        initial_weights: weights at start of tuning
        config: detection configuration
        already_locked: set of rule IDs already locked (skip these)
        current_iteration: current iteration number
    
    Returns:
        List of LockedRule records for newly detected unsatisfiable rules.
    """
    if len(satisfaction_history) < config.window_size:
        return []  # Not enough history yet
    
    newly_locked: List[LockedRule] = []
    window = satisfaction_history[-config.window_size:]
    
    for i, rule in enumerate(rules):
        rule_id = rule.get("id", i)
        
        if rule_id in already_locked:
            continue
        
        current_weight = weights.get(rule_id, 1.0)
        initial_weight = initial_weights.get(rule_id, 1.0)
        
        # Check weight ceiling first (immediate lock)
        if current_weight >= config.weight_ceiling:
            newly_locked.append(LockedRule(
                rule_id=rule_id,
                rule_type=rule.get("type", "UNKNOWN"),
                crew_id=rule.get("crewId", ""),
                role_code=rule.get("roleCode", ""),
                reason=LockReason.WEIGHT_CEILING_HIT,
                locked_at_iteration=current_iteration,
                frozen_weight=current_weight,
                evidence={
                    "ceiling": config.weight_ceiling,
                    "currentWeight": current_weight,
                },
            ))
            continue
        
        # Analyze satisfaction pattern over window
        eligible_count = 0
        satisfied_count = 0
        
        for sat_vec in window:
            if i < len(sat_vec):
                s = sat_vec[i]
                if s != -1:  # Eligible
                    eligible_count += 1
                    if s == 1:
                        satisfied_count += 1
        
        eligible_ratio = eligible_count / len(window) if window else 0
        
        # Check lock conditions
        if eligible_ratio < config.min_eligible_ratio:
            continue  # Not eligible enough to judge
        
        if config.require_zero_satisfied and satisfied_count > 0:
            continue  # Was satisfied at least once
        
        # Optional weight growth check
        if config.min_weight_growth is not None:
            weight_ratio = current_weight / initial_weight if initial_weight > 0 else 1.0
            if weight_ratio < config.min_weight_growth:
                continue  # Weight hasn't grown enough to indicate unsat
        
        # All conditions met - lock this rule
        newly_locked.append(LockedRule(
            rule_id=rule_id,
            rule_type=rule.get("type", "UNKNOWN"),
            crew_id=rule.get("crewId", ""),
            role_code=rule.get("roleCode", ""),
            reason=LockReason.ALWAYS_UNSATISFIED,
            locked_at_iteration=current_iteration,
            frozen_weight=current_weight,
            evidence={
                "windowSize": config.window_size,
                "eligibleRatio": eligible_ratio,
                "satisfiedCount": satisfied_count,
                "weightGrowth": current_weight / initial_weight if initial_weight > 0 else None,
            },
        ))
    
    return newly_locked


# ---------------------------------------------------------------------------
# Weight Update with Locking
# ---------------------------------------------------------------------------

def apply_weight_updates_with_locks(
    proposed_weights: Dict[int, float],
    proposed_velocities: Dict[int, float],
    locked_rule_ids: Set[int],
    current_weights: Dict[int, float],
    current_velocities: Dict[int, float],
) -> Tuple[Dict[int, float], Dict[int, float]]:
    """Apply proposed weight updates, but skip locked rules.
    
    Locked rules keep their current weight and have velocity zeroed.
    
    Returns:
        Tuple of (final_weights, final_velocities)
    """
    final_weights = dict(proposed_weights)
    final_velocities = dict(proposed_velocities)
    
    for rule_id in locked_rule_ids:
        # Keep the weight frozen at its current value
        if rule_id in current_weights:
            final_weights[rule_id] = current_weights[rule_id]
        # Zero out velocity so momentum doesn't accumulate
        final_velocities[rule_id] = 0.0
    
    return final_weights, final_velocities


# ---------------------------------------------------------------------------
# Summary / Reporting
# ---------------------------------------------------------------------------

def format_locked_rules_report(locked_rules: List[LockedRule]) -> str:
    """Format a human-readable report of locked rules."""
    if not locked_rules:
        return "No rules were locked during tuning."
    
    lines = [
        f"=== Locked Rules Report ({len(locked_rules)} rules) ===",
        "",
    ]
    
    # Group by reason
    by_reason: Dict[LockReason, List[LockedRule]] = {}
    for lr in locked_rules:
        by_reason.setdefault(lr.reason, []).append(lr)
    
    for reason, rules in by_reason.items():
        lines.append(f"## {reason.value} ({len(rules)} rules)")
        for lr in rules:
            lines.append(
                f"  - Rule {lr.rule_id}: {lr.rule_type} "
                f"(crew={lr.crew_id}, role={lr.role_code}) "
                f"frozen@iter={lr.locked_at_iteration} weight={lr.frozen_weight:.2f}"
            )
        lines.append("")
    
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Module 3: The Equalizer (Fairness)
# ---------------------------------------------------------------------------

@dataclass
class FairnessConfig:
    """Configuration for fairness-weighted tuning."""
    
    # Multiplier for bottom percentile crew (boost their rules)
    bottom_multiplier: float = 2.0
    
    # Multiplier for top percentile crew (dampen their rules)
    top_multiplier: float = 0.5
    
    # Percentile thresholds (e.g., 0.1 = bottom/top 10%)
    bottom_percentile: float = 0.1
    top_percentile: float = 0.1


def compute_gini_coefficient(satisfaction_pcts: List[float]) -> float:
    """Compute Gini coefficient for crew satisfaction distribution.
    
    Gini = 0.0 means perfect equality (everyone has same satisfaction %)
    Gini = 1.0 means maximum inequality (one person has everything)
    
    Uses the relative mean absolute difference formula:
    G = (sum of |x_i - x_j| for all pairs) / (2 * n * sum of x_i)
    
    Args:
        satisfaction_pcts: List of satisfaction percentages per crew member
        
    Returns:
        Gini coefficient in [0, 1]
    """
    if not satisfaction_pcts or len(satisfaction_pcts) < 2:
        return 0.0
    
    n = len(satisfaction_pcts)
    total = sum(satisfaction_pcts)
    
    if total == 0:
        return 0.0  # Everyone has 0, technically equal
    
    # Sum of absolute differences
    abs_diff_sum = 0.0
    for i in range(n):
        for j in range(n):
            abs_diff_sum += abs(satisfaction_pcts[i] - satisfaction_pcts[j])
    
    gini = abs_diff_sum / (2 * n * total)
    return min(1.0, max(0.0, gini))


def compute_per_crew_satisfaction(
    satisfaction_vector: List[int],
    rules: List[Dict[str, Any]],
) -> Dict[str, Tuple[int, int, float]]:
    """Compute per-crew satisfaction stats.
    
    Args:
        satisfaction_vector: Binary vector aligned with rules (-1=ineligible, 0=unsat, 1=sat)
        rules: List of rule records with crewId
        
    Returns:
        Dict mapping crewId -> (satisfied_count, eligible_count, pct)
    """
    crew_stats: Dict[str, Tuple[int, int]] = {}  # crewId -> (satisfied, eligible)
    
    for i, rule in enumerate(rules):
        crew_id = rule.get("crewId", "unknown")
        s = satisfaction_vector[i] if i < len(satisfaction_vector) else 0
        
        if s < 0:  # Ineligible
            continue
        
        if crew_id not in crew_stats:
            crew_stats[crew_id] = (0, 0)
        
        sat, elig = crew_stats[crew_id]
        crew_stats[crew_id] = (sat + (1 if s == 1 else 0), elig + 1)
    
    # Convert to (sat, elig, pct)
    result: Dict[str, Tuple[int, int, float]] = {}
    for cid, (sat, elig) in crew_stats.items():
        pct = (100.0 * sat / elig) if elig > 0 else 0.0
        result[cid] = (sat, elig, pct)
    
    return result


def classify_crew_by_fairness(
    per_crew_stats: Dict[str, Tuple[int, int, float]],
    config: FairnessConfig,
) -> Tuple[Set[str], Set[str], Set[str]]:
    """Classify crew into bottom, middle, and top tiers based on satisfaction.
    
    Args:
        per_crew_stats: Dict from compute_per_crew_satisfaction
        config: FairnessConfig with percentile thresholds
        
    Returns:
        (bottom_crew_ids, middle_crew_ids, top_crew_ids)
    """
    if not per_crew_stats:
        return set(), set(), set()
    
    # Sort by satisfaction percentage
    sorted_crew = sorted(per_crew_stats.items(), key=lambda x: x[1][2])
    n = len(sorted_crew)
    
    # Calculate cutoff indices
    bottom_cutoff = max(1, int(n * config.bottom_percentile))
    top_cutoff = max(1, int(n * config.top_percentile))
    
    bottom_ids = {cid for cid, _ in sorted_crew[:bottom_cutoff]}
    top_ids = {cid for cid, _ in sorted_crew[-top_cutoff:]}
    middle_ids = {cid for cid, _ in sorted_crew} - bottom_ids - top_ids
    
    return bottom_ids, middle_ids, top_ids


def get_fairness_multiplier(
    crew_id: str,
    bottom_ids: Set[str],
    top_ids: Set[str],
    config: FairnessConfig,
) -> float:
    """Get the weight update multiplier for a crew member based on fairness tier.
    
    Args:
        crew_id: The crew member's ID
        bottom_ids: Set of bottom-tier crew IDs
        top_ids: Set of top-tier crew IDs
        config: FairnessConfig with multipliers
        
    Returns:
        Multiplier to apply to weight updates (e.g., 2.0 for bottom, 0.5 for top)
    """
    if crew_id in bottom_ids:
        return config.bottom_multiplier
    elif crew_id in top_ids:
        return config.top_multiplier
    else:
        return 1.0  # Middle tier, no adjustment


def apply_fairness_to_weight_deltas(
    weight_deltas: Dict[int, float],
    rules: List[Dict[str, Any]],
    satisfaction_vector: List[int],
    config: FairnessConfig,
) -> Tuple[Dict[int, float], Dict[str, Any]]:
    """Apply fairness multipliers to weight deltas based on per-crew satisfaction.
    
    This is the main entry point for Module 3. Call this after computing weight
    deltas but before applying them.
    
    Args:
        weight_deltas: Dict mapping rule_id -> proposed weight change
        rules: List of rule records with crewId
        satisfaction_vector: Current satisfaction vector
        config: FairnessConfig
        
    Returns:
        (adjusted_deltas, fairness_report) where fairness_report contains stats
    """
    # Compute per-crew stats
    per_crew = compute_per_crew_satisfaction(satisfaction_vector, rules)
    
    # Compute Gini
    pcts = [stats[2] for stats in per_crew.values()]
    gini = compute_gini_coefficient(pcts)
    
    # Classify crew
    bottom_ids, middle_ids, top_ids = classify_crew_by_fairness(per_crew, config)
    
    # Build rule_id -> crew_id mapping
    rule_to_crew: Dict[int, str] = {}
    for rule in rules:
        rule_id = rule.get("id")
        crew_id = rule.get("crewId", "unknown")
        if rule_id is not None:
            rule_to_crew[rule_id] = crew_id
    
    # Apply multipliers
    adjusted_deltas: Dict[int, float] = {}
    for rule_id, delta in weight_deltas.items():
        crew_id = rule_to_crew.get(rule_id, "unknown")
        multiplier = get_fairness_multiplier(crew_id, bottom_ids, top_ids, config)
        adjusted_deltas[rule_id] = delta * multiplier
    
    # Build report
    fairness_report = {
        "gini": gini,
        "bottom_crew": list(bottom_ids),
        "top_crew": list(top_ids),
        "per_crew_pct": {cid: stats[2] for cid, stats in per_crew.items()},
        "min_pct": min(pcts) if pcts else 0.0,
        "max_pct": max(pcts) if pcts else 0.0,
        "spread": (max(pcts) - min(pcts)) if pcts else 0.0,
    }
    
    return adjusted_deltas, fairness_report
