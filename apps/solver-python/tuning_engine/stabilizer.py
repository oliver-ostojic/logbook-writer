"""Module 2: The Stabilizer (Differential Analysis).

Responsibilities:
- Calculate difference matrix between iterations
- Compute Hamming distance (volatility)
- Classify rules by satisfaction behavior (stuck, oscillating, etc.)
- Apply momentum-based damped weight updates for stability

TODO: Add conflict detection to find anti-correlated rule pairs.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Tuple

from .types import CrewRoleRuleRecord


class RuleStatus(Enum):
    """Classification of rule behavior across iterations."""
    STABLE_SATISFIED = "stable_satisfied"      # Always 1
    STABLE_UNSATISFIED = "stable_unsatisfied"  # Always 0
    RECENTLY_FIXED = "recently_fixed"          # Was 0, now 1
    RECENTLY_BROKEN = "recently_broken"        # Was 1, now 0
    OSCILLATING = "oscillating"                # Keeps flipping
    STUCK = "stuck"                            # Failed >= STUCK_THRESHOLD consecutive times
    UNKNOWN = "unknown"                        # Not enough history


# After this many consecutive failures, a rule is considered "stuck"
STUCK_THRESHOLD = 3


# ---------------------------------------------------------------------------
# Difference Matrix
# ---------------------------------------------------------------------------


def difference_matrix(s_current: List[int], s_prev: List[int]) -> List[int]:
    """Compute cell-by-cell difference between two satisfaction vectors.

    Returns:
        A list where each element is:
          +1  if rule went from 0 -> 1 (gain)
          -1  if rule went from 1 -> 0 (pain)
           0  if rule stayed the same (stagnant)
    """
    result: List[int] = []
    for i in range(max(len(s_current), len(s_prev))):
        curr = s_current[i] if i < len(s_current) else 0
        prev = s_prev[i] if i < len(s_prev) else 0
        result.append(curr - prev)
    return result


# ---------------------------------------------------------------------------
# Hamming Distance
# ---------------------------------------------------------------------------


def hamming_distance(s_current: List[int], s_prev: List[int]) -> int:
    """Count the number of bits that changed between two satisfaction vectors.

    H = Σ |S_t(i) - S_{t-1}(i)|

    A lower Hamming distance indicates stability.
    """
    total = 0
    for i in range(max(len(s_current), len(s_prev))):
        curr = s_current[i] if i < len(s_current) else 0
        prev = s_prev[i] if i < len(s_prev) else 0
        total += abs(curr - prev)
    return total


# ---------------------------------------------------------------------------
# Conflict Detection
# ---------------------------------------------------------------------------


def format_rule_description(rule: Dict[str, Any]) -> str:
    """Create a human-readable description of a rule.
    
    Examples:
        - "REG CANNOT_BE_ASSIGNED_AFTER P_HELM"
        - "P_HELM TIMING (early)"
        - "REG DISTRIBUTION_BETWEEN_ROLE_X 40%"
        - "PROD MIN_CONSECUTIVE_MINUTES 30min"
    """
    role = rule.get("roleCode", "?")
    rule_type = rule.get("type", "UNKNOWN")
    target_role = rule.get("targetRoleCode")
    value = rule.get("valueInt")
    
    # Build base description
    desc = f"{role} {rule_type}"
    
    # Add target role if present (e.g., CANNOT_BE_ASSIGNED_AFTER P_HELM)
    if target_role:
        desc += f" {target_role}"
    
    # Add value with context based on rule type
    if value is not None:
        if rule_type == "TIMING":
            timing_labels = {-1: "early", 0: "neutral", 1: "late"}
            desc += f" ({timing_labels.get(value, str(value))})"
        elif rule_type in ("MIN_CONSECUTIVE_MINUTES", "MAX_CONSECUTIVE_MINUTES"):
            desc += f" ({value}min)"
        elif rule_type == "DISTRIBUTION_BETWEEN_ROLE_X":
            desc += f" ({value}%)"
        elif rule_type in ("ASSIGN_AFTER_SHIFT_MIN_X", "ASSIGN_BEFORE_SHIFT_MIN_X"):
            desc += f" ({value}min)"
        elif rule_type == "CANNOT_ASSIGN_DURING_STORE_HOUR_X":
            desc += f" (hour {value})"
        elif rule_type in ("LIKE_ROLE_FOR_HOUR_X", "DISLIKE_ROLE_FOR_HOUR_X"):
            desc += f" (hour {value})"
        else:
            desc += f" ({value})"
    
    return desc


class ConflictPair:
    """A pair of rules that are anti-correlated (can't both be satisfied)."""
    
    def __init__(
        self,
        rule_a_id: int,
        rule_b_id: int,
        correlation: float,
        rule_a_info: Dict[str, Any] | None = None,
        rule_b_info: Dict[str, Any] | None = None,
    ):
        self.rule_a_id = rule_a_id
        self.rule_b_id = rule_b_id
        self.correlation = correlation
        self.rule_a_info = rule_a_info or {}
        self.rule_b_info = rule_b_info or {}
    
    @property
    def rule_a_description(self) -> str:
        """Human-readable description of rule A."""
        return format_rule_description(self.rule_a_info)
    
    @property
    def rule_b_description(self) -> str:
        """Human-readable description of rule B."""
        return format_rule_description(self.rule_b_info)
    
    @property
    def is_same_crew(self) -> bool:
        """Whether both rules belong to the same crew member."""
        return (
            self.rule_a_info.get("crewId") is not None and
            self.rule_a_info.get("crewId") == self.rule_b_info.get("crewId")
        )
    
    def __repr__(self) -> str:
        return f"ConflictPair({self.rule_a_id} ↔ {self.rule_b_id}, r={self.correlation:.2f})"
    
    def describe(self) -> str:
        """Full human-readable conflict description."""
        crew_a = self.rule_a_info.get("crewId", "?")
        crew_b = self.rule_b_info.get("crewId", "?")
        same_crew = " [SAME CREW]" if self.is_same_crew else ""
        return (
            f"{self.rule_a_description} (crew {crew_a}) ↔ "
            f"{self.rule_b_description} (crew {crew_b}){same_crew} "
            f"[r={self.correlation:.2f}]"
        )


def _pearson_correlation(x: List[int], y: List[int]) -> float:
    """Calculate Pearson correlation coefficient between two binary vectors.
    
    Returns value in [-1, 1]:
      -1 = perfect negative correlation (conflict)
       0 = no correlation
      +1 = perfect positive correlation
    """
    n = len(x)
    if n < 2:
        return 0.0
    
    # Calculate means
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    
    # Calculate covariance and standard deviations
    cov = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n)) / n
    std_x = (sum((xi - mean_x) ** 2 for xi in x) / n) ** 0.5
    std_y = (sum((yi - mean_y) ** 2 for yi in y) / n) ** 0.5
    
    # Avoid division by zero (constant vectors)
    if std_x < 1e-9 or std_y < 1e-9:
        return 0.0
    
    return cov / (std_x * std_y)


def detect_conflicts(
    history: List[List[int]],
    rules: List[CrewRoleRuleRecord],
    threshold: float = -0.5,
    min_samples: int = 3,
) -> List[ConflictPair]:
    """Detect pairs of rules with strong negative correlation.
    
    Two rules are in conflict if satisfying one tends to unsatisfy the other.
    We detect this by finding negative correlation in satisfaction history.
    
    Args:
        history: List of satisfaction vectors (one per iteration)
        rules: List of rule records
        threshold: Correlation threshold for conflict (default -0.5)
        min_samples: Minimum iterations needed for reliable detection
    
    Returns:
        List of ConflictPair objects sorted by correlation (most negative first)
    """
    if len(history) < min_samples:
        return []
    
    num_rules = len(rules)
    if num_rules < 2:
        return []
    
    conflicts: List[ConflictPair] = []
    
    # Build per-rule satisfaction vectors (transpose of history)
    rule_vectors: List[List[int]] = []
    for i in range(num_rules):
        vec = [
            hist[i] if i < len(hist) else 0
            for hist in history
        ]
        rule_vectors.append(vec)
    
    # Check all pairs (O(n^2) but n is typically small)
    for i in range(num_rules):
        for j in range(i + 1, num_rules):
            corr = _pearson_correlation(rule_vectors[i], rule_vectors[j])
            
            if corr <= threshold:
                rule_a = rules[i]
                rule_b = rules[j]
                
                conflict = ConflictPair(
                    rule_a_id=rule_a.get("id", i),
                    rule_b_id=rule_b.get("id", j),
                    correlation=corr,
                    rule_a_info={
                        "type": rule_a.get("type"),
                        "ruleType": rule_a.get("type"),  # Keep for backwards compat
                        "crewId": rule_a.get("crewId"),
                        "roleCode": rule_a.get("roleCode"),
                        "targetRoleCode": rule_a.get("targetRoleCode"),
                        "valueInt": rule_a.get("valueInt"),
                    },
                    rule_b_info={
                        "type": rule_b.get("type"),
                        "ruleType": rule_b.get("type"),  # Keep for backwards compat
                        "crewId": rule_b.get("crewId"),
                        "roleCode": rule_b.get("roleCode"),
                        "targetRoleCode": rule_b.get("targetRoleCode"),
                        "valueInt": rule_b.get("valueInt"),
                    },
                )
                conflicts.append(conflict)
    
    # Sort by correlation (most negative first)
    conflicts.sort(key=lambda c: c.correlation)
    
    return conflicts


def apply_conflict_resolution(
    weights: Dict[int, float],
    conflicts: List[ConflictPair],
    strategy: str = "cap",
    cap_weight: float = 2.0,
    reduction_factor: float = 0.3,
    min_weight: float = 0.5,
) -> Tuple[Dict[int, float], int]:
    """Adjust weights for rules involved in conflicts.
    
    Strategies:
    - "cap": Cap the weight of conflicting rules so they don't dominate
    - "balance": Reduce the higher-weighted rule to match the lower one
    - "reduce": Reduce both weights toward baseline
    
    Args:
        weights: Current weight dict (rule_id -> weight)
        conflicts: List of detected conflicts
        strategy: Resolution strategy ("cap", "balance", or "reduce")
        cap_weight: Maximum weight for conflicting rules (for "cap" strategy)
        reduction_factor: How much to reduce (for "reduce" strategy)
        min_weight: Minimum weight floor
    
    Returns:
        Tuple of (new_weights, num_rules_adjusted)
    """
    if not conflicts:
        return dict(weights), 0
    
    new_weights = dict(weights)
    adjusted_rules: set = set()
    
    # Track which rules are in conflicts
    conflicting_rule_ids: set = set()
    for conflict in conflicts:
        conflicting_rule_ids.add(conflict.rule_a_id)
        conflicting_rule_ids.add(conflict.rule_b_id)
    
    if strategy == "cap":
        # Cap conflicting rules at a maximum weight
        # This prevents endless boosting of rules that can't be satisfied together
        for rule_id in conflicting_rule_ids:
            current_w = new_weights.get(rule_id, 1.0)
            if current_w > cap_weight:
                new_weights[rule_id] = cap_weight
                adjusted_rules.add(rule_id)
    
    elif strategy == "balance":
        # For each conflict pair, bring the higher weight down closer to the lower
        for conflict in conflicts:
            w_a = new_weights.get(conflict.rule_a_id, 1.0)
            w_b = new_weights.get(conflict.rule_b_id, 1.0)
            
            # Average the two weights
            avg_weight = (w_a + w_b) / 2
            
            if w_a > avg_weight:
                new_weights[conflict.rule_a_id] = max(min_weight, avg_weight)
                adjusted_rules.add(conflict.rule_a_id)
            if w_b > avg_weight:
                new_weights[conflict.rule_b_id] = max(min_weight, avg_weight)
                adjusted_rules.add(conflict.rule_b_id)
    
    elif strategy == "reduce":
        # Reduce excess weight for conflicting rules
        for rule_id in conflicting_rule_ids:
            w = new_weights.get(rule_id, 1.0)
            if w > 1.0:
                excess = w - 1.0
                new_w = 1.0 + excess * (1 - reduction_factor)
                new_weights[rule_id] = max(min_weight, new_w)
                adjusted_rules.add(rule_id)
    
    return new_weights, len(adjusted_rules)


def print_conflict_report(
    conflicts: List[ConflictPair],
    max_display: int = 20,
) -> None:
    """Print a human-readable conflict report."""
    if not conflicts:
        print("No conflicts detected.")
        return
    
    print(f"\n{'='*70}")
    print(f"CONFLICT DETECTION REPORT")
    print(f"{'='*70}")
    print(f"Total conflicts found: {len(conflicts)}")
    print(f"\nTop {min(max_display, len(conflicts))} conflicts (by correlation):\n")
    
    print(f"{'RuleA':<8} {'TypeA':<30} {'RuleB':<8} {'TypeB':<30} {'Corr':<8}")
    print("-" * 84)
    
    for conflict in conflicts[:max_display]:
        type_a = (conflict.rule_a_info.get("ruleType") or "?")[:28]
        type_b = (conflict.rule_b_info.get("ruleType") or "?")[:28]
        print(
            f"{conflict.rule_a_id:<8} {type_a:<30} "
            f"{conflict.rule_b_id:<8} {type_b:<30} "
            f"{conflict.correlation:+.3f}"
        )
    
    if len(conflicts) > max_display:
        print(f"\n... and {len(conflicts) - max_display} more conflicts")
    
    # Summary by conflict type
    print(f"\n{'='*70}")
    print("CONFLICT PATTERNS:")
    print("-" * 70)
    
    # Group by rule type pairs
    type_pairs: Dict[str, int] = {}
    for conflict in conflicts:
        type_a = conflict.rule_a_info.get("ruleType") or "UNKNOWN"
        type_b = conflict.rule_b_info.get("ruleType") or "UNKNOWN"
        key = f"{min(type_a, type_b)} ↔ {max(type_a, type_b)}"
        type_pairs[key] = type_pairs.get(key, 0) + 1
    
    for pair, count in sorted(type_pairs.items(), key=lambda x: -x[1]):
        print(f"  {pair}: {count} conflicts")
    
    # Check for same-crew conflicts
    same_crew_conflicts = [
        c for c in conflicts
        if c.rule_a_info.get("crewId") == c.rule_b_info.get("crewId")
        and c.rule_a_info.get("crewId") is not None
    ]
    if same_crew_conflicts:
        print(f"\n⚠️  Same-crew conflicts: {len(same_crew_conflicts)}")
        print("   (Rules for the same person that can't both be satisfied)")
    
    # Crew conflict analysis
    print(f"\n{'='*70}")
    print("CREW CONFLICT ANALYSIS:")
    print("-" * 70)
    
    # Count conflicts per crew
    crew_conflict_count: Dict[Any, int] = {}
    for conflict in conflicts:
        crew_a = conflict.rule_a_info.get("crewId")
        crew_b = conflict.rule_b_info.get("crewId")
        if crew_a is not None:
            crew_conflict_count[crew_a] = crew_conflict_count.get(crew_a, 0) + 1
        if crew_b is not None and crew_b != crew_a:
            crew_conflict_count[crew_b] = crew_conflict_count.get(crew_b, 0) + 1
    
    # Sort by conflict count (most conflicts first)
    sorted_crews = sorted(crew_conflict_count.items(), key=lambda x: -x[1])
    
    if sorted_crews:
        print(f"\nCrew members with most conflicts (top 10):")
        print(f"{'CrewId':<15} {'Conflicts':<12} {'Notes'}")
        print("-" * 50)
        
        for crew_id, count in sorted_crews[:10]:
            # Find what types of rules this crew has in conflicts
            crew_rules = set()
            for c in conflicts:
                if c.rule_a_info.get("crewId") == crew_id:
                    crew_rules.add(c.rule_a_info.get("ruleType") or "?")
                if c.rule_b_info.get("crewId") == crew_id:
                    crew_rules.add(c.rule_b_info.get("ruleType") or "?")
            
            rules_str = ", ".join(sorted(crew_rules)[:3])
            if len(crew_rules) > 3:
                rules_str += f" +{len(crew_rules)-3}"
            
            print(f"{crew_id:<15} {count:<12} {rules_str}")
        
        if len(sorted_crews) > 10:
            print(f"\n... and {len(sorted_crews) - 10} more crew members with conflicts")
    
    # Detailed same-crew conflicts
    if same_crew_conflicts:
        print(f"\n{'='*70}")
        print("SAME-CREW CONFLICTS (internal preference conflicts):")
        print("-" * 70)
        print(f"{'CrewId':<12} {'RuleA':<8} {'TypeA':<25} {'RuleB':<8} {'TypeB':<25}")
        print("-" * 78)
        
        for conflict in same_crew_conflicts[:15]:
            crew_id = conflict.rule_a_info.get("crewId", "?")
            type_a = (conflict.rule_a_info.get("ruleType") or "?")[:24]
            type_b = (conflict.rule_b_info.get("ruleType") or "?")[:24]
            print(
                f"{crew_id:<12} {conflict.rule_a_id:<8} {type_a:<25} "
                f"{conflict.rule_b_id:<8} {type_b:<25}"
            )
        
        if len(same_crew_conflicts) > 15:
            print(f"\n... and {len(same_crew_conflicts) - 15} more same-crew conflicts")
    
    print(f"{'='*70}\n")


def damped_update(
    w_current: float,
    w_target: float,
    alpha: float = 0.2,
) -> float:
    """Apply exponential smoothing to weight update (legacy EMA approach).

    W_new = W_current + α × (W_target - W_current)

    Args:
        w_current: current weight value
        w_target: where we want the weight to go
        alpha: smoothing factor (0.2 = slow, 0.5 = medium, 1.0 = instant)

    Returns:
        New weight value.
    """
    return w_current + alpha * (w_target - w_current)


# ---------------------------------------------------------------------------
# Rule Classification
# ---------------------------------------------------------------------------


def classify_rules(
    history: List[List[int]],
    rules: List[CrewRoleRuleRecord],
) -> Dict[int, RuleStatus]:
    """Classify each rule based on satisfaction history.
    
    Args:
        history: List of satisfaction vectors (one per iteration)
        rules: List of rule records (to get rule IDs)
    
    Returns:
        Dict mapping rule_id -> RuleStatus
    """
    if not history or not rules:
        return {}
    
    classifications: Dict[int, RuleStatus] = {}
    num_iterations = len(history)
    
    for i, rule in enumerate(rules):
        rule_id = rule.get("id", i)
        
        # Get this rule's satisfaction across all iterations
        rule_history = [
            hist[i] if i < len(hist) else 0 
            for hist in history
        ]
        
        if num_iterations < 2:
            classifications[rule_id] = RuleStatus.UNKNOWN
            continue
        
        # Check for stuck (consecutive failures at end)
        consecutive_failures = 0
        for sat in reversed(rule_history):
            if sat == 0:
                consecutive_failures += 1
            else:
                break
        
        if consecutive_failures >= STUCK_THRESHOLD:
            classifications[rule_id] = RuleStatus.STUCK
            continue
        
        # Count flips - check oscillating early (before recently_fixed/broken)
        flips = sum(
            1 for j in range(1, len(rule_history)) 
            if rule_history[j] != rule_history[j-1]
        )
        
        # If more than half the iterations are flips, it's oscillating
        if flips >= num_iterations // 2 and flips >= 2:
            classifications[rule_id] = RuleStatus.OSCILLATING
            continue
        
        # Check for stable patterns
        if all(s == 1 for s in rule_history):
            classifications[rule_id] = RuleStatus.STABLE_SATISFIED
            continue
        
        if all(s == 0 for s in rule_history):
            classifications[rule_id] = RuleStatus.STABLE_UNSATISFIED
            continue
        
        # Check current vs previous for recent changes
        current = rule_history[-1]
        previous = rule_history[-2]
        
        if current == 1 and previous == 0:
            classifications[rule_id] = RuleStatus.RECENTLY_FIXED
        elif current == 0 and previous == 1:
            classifications[rule_id] = RuleStatus.RECENTLY_BROKEN
        elif current == 1:
            classifications[rule_id] = RuleStatus.STABLE_SATISFIED
        else:
            classifications[rule_id] = RuleStatus.STABLE_UNSATISFIED
    
    return classifications


# ---------------------------------------------------------------------------
# Momentum-Based Damped Tuning
# ---------------------------------------------------------------------------


def damped_tune(
    satisfaction: List[int],
    weights: Dict[int, float],
    velocities: Dict[int, float],
    rules: List[CrewRoleRuleRecord],
    history: List[List[int]] | None = None,
    *,
    beta: float = 0.5,          # Momentum factor (lower = faster response to changes)
    learning_rate: float = 1.0,  # How much velocity affects weight (bigger steps)
    stuck_boost: float = 2.0,    # Extra multiplier for stuck rules
    min_weight: float = 0.1,     # Floor for weights
    max_weight: float = 100.0,   # Ceiling for weights
) -> Tuple[Dict[int, float], Dict[int, float]]:
    """Apply momentum-based weight updates.
    
    For each rule:
    - Calculate gradient: +1 if unsatisfied, -0.1 if satisfied
    - Update velocity with momentum: v = β*v + (1-β)*gradient
    - Update weight: w += learning_rate * velocity
    - Apply stuck boost if rule has failed 3+ times in a row
    
    Ineligible rules (satisfaction = -1) are skipped - their weights
    and velocities remain unchanged.
    
    Args:
        satisfaction: Current satisfaction vector (-1=ineligible, 0=violated, 1=satisfied)
        weights: Current weights dict (rule_id -> weight)
        velocities: Current velocities dict (rule_id -> velocity)
        rules: List of rule records
        history: Optional satisfaction history for stuck detection
        beta: Momentum factor (higher = more inertia)
        learning_rate: Step size for weight updates
        stuck_boost: Extra multiplier for stuck rules
        min_weight: Minimum weight value
        max_weight: Maximum weight value
    
    Returns:
        Tuple of (new_weights, new_velocities)
    """
    new_weights: Dict[int, float] = {}
    new_velocities: Dict[int, float] = {}
    
    # Classify rules if we have history
    classifications: Dict[int, RuleStatus] = {}
    if history and len(history) >= STUCK_THRESHOLD:
        classifications = classify_rules(history, rules)
    
    for i, rule in enumerate(rules):
        rule_id = rule.get("id", i)
        old_weight = weights.get(rule_id, 1.0)
        old_velocity = velocities.get(rule_id, 0.0)
        
        # Get satisfaction (default to 0 if out of bounds)
        sat = satisfaction[i] if i < len(satisfaction) else 0
        
        # Skip ineligible rules - preserve their weights/velocities
        if sat == -1:
            new_weights[rule_id] = old_weight
            new_velocities[rule_id] = old_velocity
            continue
        
        # Calculate gradient
        # +1.0 if unsatisfied (push weight up)
        # -0.1 if satisfied (gentle decay toward baseline)
        gradient = 1.0 if sat == 0 else -0.1
        
        # Check if stuck - apply boost
        rule_status = classifications.get(rule_id, RuleStatus.UNKNOWN)
        if rule_status == RuleStatus.STUCK:
            gradient *= stuck_boost
        
        # Update velocity with momentum
        new_velocity = beta * old_velocity + (1 - beta) * gradient
        new_velocities[rule_id] = new_velocity
        
        # Update weight
        new_weight = old_weight + learning_rate * new_velocity
        
        # Clamp to bounds
        new_weight = max(min_weight, min(max_weight, new_weight))
        new_weights[rule_id] = new_weight
    
    return new_weights, new_velocities


# ---------------------------------------------------------------------------
# Legacy EMA-based tuning (kept for reference)
# ---------------------------------------------------------------------------


def damped_tune_ema(
    satisfaction: List[int],
    weights: Dict[int, float],
    rule_ids: List[int],
    *,
    step: float = 0.5,
    alpha: float = 0.2,
) -> Dict[int, float]:
    """Apply damped tuning using EMA: if unsatisfied, move toward higher weight slowly.

    Uses damped_update to smooth weight changes. (Legacy approach)
    """
    new_weights = dict(weights)
    for i, rule_id in enumerate(rule_ids):
        s = satisfaction[i] if i < len(satisfaction) else 0
        current_w = weights.get(rule_id, 1.0)
        if s == 0:
            target_w = current_w + step
            new_weights[rule_id] = damped_update(current_w, target_w, alpha)
        else:
            # Satisfied: no change (or could decay, TBD)
            new_weights[rule_id] = current_w
    return new_weights


# ---------------------------------------------------------------------------
# Analysis Helpers
# ---------------------------------------------------------------------------


def get_stuck_rules(
    history: List[List[int]],
    rules: List[CrewRoleRuleRecord],
) -> List[Dict[str, Any]]:
    """Get list of rules that are stuck (failed 3+ consecutive times).
    
    Returns list of dicts with rule info for reporting.
    """
    classifications = classify_rules(history, rules)
    stuck = []
    
    for rule in rules:
        rule_id = rule.get("id")
        if classifications.get(rule_id) == RuleStatus.STUCK:
            stuck.append({
                "id": rule_id,
                "type": rule.get("type"),
                "crewId": rule.get("crewId"),
                "roleCode": rule.get("roleCode"),
            })
    
    return stuck


def get_oscillating_rules(
    history: List[List[int]],
    rules: List[CrewRoleRuleRecord],
) -> List[Dict[str, Any]]:
    """Get list of rules that are oscillating.
    
    Returns list of dicts with rule info for reporting.
    """
    classifications = classify_rules(history, rules)
    oscillating = []
    
    for rule in rules:
        rule_id = rule.get("id")
        if classifications.get(rule_id) == RuleStatus.OSCILLATING:
            oscillating.append({
                "id": rule_id,
                "type": rule.get("type"),
                "crewId": rule.get("crewId"),
                "roleCode": rule.get("roleCode"),
            })
    
    return oscillating


def summarize_rule_statuses(
    history: List[List[int]],
    rules: List[CrewRoleRuleRecord],
) -> Dict[str, int]:
    """Get counts of each rule status.
    
    Returns dict like {"stable_satisfied": 50, "stuck": 5, ...}
    """
    classifications = classify_rules(history, rules)
    counts: Dict[str, int] = {}
    
    for status in classifications.values():
        key = status.value
        counts[key] = counts.get(key, 0) + 1
    
    return counts


# ---------------------------------------------------------------------------
# Conflict-Aware Damped Tuning
# ---------------------------------------------------------------------------


def damped_tune_with_conflicts(
    satisfaction: List[int],
    weights: Dict[int, float],
    velocities: Dict[int, float],
    rules: List[CrewRoleRuleRecord],
    conflicts: List[ConflictPair],
    history: List[List[int]] | None = None,
    *,
    beta: float = 0.9,
    learning_rate: float = 0.3,
    stuck_boost: float = 1.5,
    min_weight: float = 0.1,
    max_weight: float = 100.0,
) -> Tuple[Dict[int, float], Dict[int, float], Dict[int, float]]:
    """Apply momentum-based weight updates with conflict-aware damping.
    
    This is an enhanced version of damped_tune that:
    1. Detects rules involved in conflicts
    2. Applies damping to the lower-priority rule in each conflict
    3. Prevents oscillation between conflicting rules
    
    Args:
        satisfaction: Current satisfaction vector (-1=ineligible, 0=violated, 1=satisfied)
        weights: Current weights dict (rule_id -> weight)
        velocities: Current velocities dict (rule_id -> velocity)
        rules: List of rule records
        conflicts: List of detected ConflictPair objects
        history: Optional satisfaction history for stuck detection
        beta: Momentum factor
        learning_rate: Step size for weight updates
        stuck_boost: Extra multiplier for stuck rules
        min_weight: Minimum weight value
        max_weight: Maximum weight value
    
    Returns:
        Tuple of (new_weights, new_velocities, dampings)
        dampings maps rule_id -> damping factor applied (1.0 if not in conflict)
    """
    # Import resolver here to avoid circular imports
    from .conflict_resolver import ConflictResolver
    
    # Process conflicts to get per-rule damping factors
    resolver = ConflictResolver()
    dampings = resolver.process_conflicts(conflicts)
    
    new_weights: Dict[int, float] = {}
    new_velocities: Dict[int, float] = {}
    
    # Classify rules if we have history
    classifications: Dict[int, RuleStatus] = {}
    if history and len(history) >= STUCK_THRESHOLD:
        classifications = classify_rules(history, rules)
    
    for i, rule in enumerate(rules):
        rule_id = rule.get("id", i)
        old_weight = weights.get(rule_id, 1.0)
        old_velocity = velocities.get(rule_id, 0.0)
        
        # Get satisfaction (default to 0 if out of bounds)
        sat = satisfaction[i] if i < len(satisfaction) else 0
        
        # Skip ineligible rules - preserve their weights/velocities
        if sat == -1:
            new_weights[rule_id] = old_weight
            new_velocities[rule_id] = old_velocity
            continue
        
        # Calculate base gradient
        gradient = 1.0 if sat == 0 else -0.1
        
        # Apply stuck boost
        rule_status = classifications.get(rule_id, RuleStatus.UNKNOWN)
        if rule_status == RuleStatus.STUCK:
            gradient *= stuck_boost
        
        # Apply conflict damping - reduce gradient for rules in losing conflicts
        damping_factor = dampings.get(rule_id, 1.0)
        gradient *= damping_factor
        
        # Update velocity with momentum
        new_velocity = beta * old_velocity + (1 - beta) * gradient
        new_velocities[rule_id] = new_velocity
        
        # Update weight (also damped by conflict factor for smoother transitions)
        new_weight = old_weight + learning_rate * new_velocity
        
        # Clamp to bounds
        new_weight = max(min_weight, min(max_weight, new_weight))
        new_weights[rule_id] = new_weight
    
    return new_weights, new_velocities, dampings
