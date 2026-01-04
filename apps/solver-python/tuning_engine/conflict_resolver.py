"""
Smart Conflict Resolver for the Tuning Engine.

This module handles detected rule conflicts intelligently by:
1. Using a priority hierarchy to determine which rules should "win"
2. Applying conflict-aware damping to prevent oscillation
3. Flagging persistent conflicts for human review
4. Providing resolution strategies for known conflict patterns
"""

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Dict, List, Optional, Set, Tuple
from .stabilizer import ConflictPair


class RulePriority(IntEnum):
    """Priority hierarchy for rule types.
    
    Higher priority rules should be satisfied before lower priority ones.
    When two rules conflict, the lower priority rule gets damped.
    """
    # Hard constraints - must be satisfied
    CANNOT_BE_ASSIGNED_BEFORE = 100
    CANNOT_BE_ASSIGNED_AFTER = 100
    
    # Distribution constraints - important for fairness
    MAX_CONSECUTIVE_MINUTES = 80
    DISTRIBUTION_BETWEEN_ROLE_X = 70
    
    # Preference constraints - nice to have
    LIKE_ROLE_FOR_HOUR_X = 50
    TIMING = 40
    
    # Default for unknown types
    DEFAULT = 30


# Known conflict patterns and their resolution strategies
CONFLICT_STRATEGIES: Dict[Tuple[str, str], Dict] = {
    # ORDERING vs TIMING: Ordering wins, reduce timing weight
    ("CANNOT_BE_ASSIGNED_AFTER", "TIMING"): {
        "winner": "CANNOT_BE_ASSIGNED_AFTER",
        "loser_damping": 0.3,  # Reduce timing adjustments by 70%
        "description": "Ordering constraints take precedence over timing preferences"
    },
    ("CANNOT_BE_ASSIGNED_BEFORE", "TIMING"): {
        "winner": "CANNOT_BE_ASSIGNED_BEFORE", 
        "loser_damping": 0.3,
        "description": "Ordering constraints take precedence over timing preferences"
    },
    
    # ORDERING vs DISTRIBUTION: Ordering wins, slightly reduce distribution
    ("CANNOT_BE_ASSIGNED_AFTER", "DISTRIBUTION_BETWEEN_ROLE_X"): {
        "winner": "CANNOT_BE_ASSIGNED_AFTER",
        "loser_damping": 0.5,
        "description": "Ordering constraints may limit distribution possibilities"
    },
    ("CANNOT_BE_ASSIGNED_BEFORE", "DISTRIBUTION_BETWEEN_ROLE_X"): {
        "winner": "CANNOT_BE_ASSIGNED_BEFORE",
        "loser_damping": 0.5,
        "description": "Ordering constraints may limit distribution possibilities"
    },
    
    # ORDERING vs LIKE_ROLE: Ordering wins
    ("CANNOT_BE_ASSIGNED_AFTER", "LIKE_ROLE_FOR_HOUR_X"): {
        "winner": "CANNOT_BE_ASSIGNED_AFTER",
        "loser_damping": 0.4,
        "description": "Ordering constraints override hour preferences"
    },
    ("CANNOT_BE_ASSIGNED_BEFORE", "LIKE_ROLE_FOR_HOUR_X"): {
        "winner": "CANNOT_BE_ASSIGNED_BEFORE",
        "loser_damping": 0.4,
        "description": "Ordering constraints override hour preferences"
    },
    
    # MAX_CONSECUTIVE vs TIMING: Max consecutive wins
    ("MAX_CONSECUTIVE_MINUTES", "TIMING"): {
        "winner": "MAX_CONSECUTIVE_MINUTES",
        "loser_damping": 0.5,
        "description": "Consecutive limits may force sub-optimal timing"
    },
    
    # DISTRIBUTION vs TIMING: Distribution wins (fairness > preference)
    ("DISTRIBUTION_BETWEEN_ROLE_X", "TIMING"): {
        "winner": "DISTRIBUTION_BETWEEN_ROLE_X",
        "loser_damping": 0.6,
        "description": "Fair distribution takes priority over timing preferences"
    },
    
    # LIKE_ROLE vs TIMING: Equal priority, mutual damping
    ("LIKE_ROLE_FOR_HOUR_X", "TIMING"): {
        "winner": None,  # Neither wins
        "loser_damping": 0.7,  # Both get slightly reduced
        "description": "Competing preferences - both reduced"
    },
    
    # DISTRIBUTION vs LIKE_ROLE: Distribution wins
    ("DISTRIBUTION_BETWEEN_ROLE_X", "LIKE_ROLE_FOR_HOUR_X"): {
        "winner": "DISTRIBUTION_BETWEEN_ROLE_X",
        "loser_damping": 0.5,
        "description": "Distribution constraints override hour preferences"
    },
    
    # MAX_CONSECUTIVE vs DISTRIBUTION: Consecutive wins
    ("MAX_CONSECUTIVE_MINUTES", "DISTRIBUTION_BETWEEN_ROLE_X"): {
        "winner": "MAX_CONSECUTIVE_MINUTES",
        "loser_damping": 0.6,
        "description": "Consecutive limits may affect distribution"
    },
    
    # Same-type conflicts: Natural competition, light damping
    ("TIMING", "TIMING"): {
        "winner": None,
        "loser_damping": 0.8,
        "description": "Natural competition for same slots"
    },
    ("CANNOT_BE_ASSIGNED_AFTER", "CANNOT_BE_ASSIGNED_AFTER"): {
        "winner": None,
        "loser_damping": 0.9,
        "description": "Multiple ordering constraints - both enforced"
    },
    ("LIKE_ROLE_FOR_HOUR_X", "LIKE_ROLE_FOR_HOUR_X"): {
        "winner": None,
        "loser_damping": 0.8,
        "description": "Competing hour preferences"
    },
    ("DISTRIBUTION_BETWEEN_ROLE_X", "DISTRIBUTION_BETWEEN_ROLE_X"): {
        "winner": None,
        "loser_damping": 0.8,
        "description": "Multiple distribution rules"
    },
    ("MAX_CONSECUTIVE_MINUTES", "MAX_CONSECUTIVE_MINUTES"): {
        "winner": None,
        "loser_damping": 0.9,
        "description": "Multiple consecutive limits - both enforced"
    },
}


@dataclass
class ResolutionResult:
    """Result of resolving a conflict between two rules."""
    rule_a_id: int
    rule_b_id: int
    rule_a_type: str
    rule_b_type: str
    winner_id: Optional[int]  # None if neither wins
    damping_a: float  # Multiplier for rule A weight adjustments (0-1)
    damping_b: float  # Multiplier for rule B weight adjustments (0-1)
    strategy_used: str
    is_same_crew: bool


@dataclass
class ConflictResolver:
    """Resolves conflicts between rules using priority and strategy patterns."""
    
    # Track which rules are in conflict for weight adjustment
    conflict_dampings: Dict[int, float] = field(default_factory=dict)
    
    # Track persistent conflicts (flagged for human review)
    persistent_conflicts: List[ConflictPair] = field(default_factory=list)
    
    # Rules that have been flagged
    flagged_rules: Set[int] = field(default_factory=set)
    
    def get_priority(self, rule_type: str) -> int:
        """Get the priority for a rule type."""
        try:
            return RulePriority[rule_type].value
        except KeyError:
            return RulePriority.DEFAULT.value
    
    def get_strategy(self, type_a: str, type_b: str) -> Optional[Dict]:
        """Get the resolution strategy for a conflict pair.
        
        Looks up in both (A, B) and (B, A) order since strategies are symmetric.
        The winner is always from the original strategy - we don't swap it.
        """
        key = (type_a, type_b)
        if key in CONFLICT_STRATEGIES:
            return CONFLICT_STRATEGIES[key]
        
        # Try reversed order - strategy is still the same
        key_reversed = (type_b, type_a)
        if key_reversed in CONFLICT_STRATEGIES:
            return CONFLICT_STRATEGIES[key_reversed]
        
        return None
    
    def resolve(self, conflict: ConflictPair) -> ResolutionResult:
        """Resolve a single conflict and determine damping factors."""
        type_a = conflict.rule_a_info.get("type", "UNKNOWN")
        type_b = conflict.rule_b_info.get("type", "UNKNOWN")
        rule_a_id = conflict.rule_a_id
        rule_b_id = conflict.rule_b_id
        is_same_crew = conflict.is_same_crew
        
        strategy = self.get_strategy(type_a, type_b)
        
        if strategy:
            winner_type = strategy["winner"]
            loser_damping = strategy["loser_damping"]
            
            if winner_type is None:
                # Neither wins - both get damped
                damping_a = loser_damping
                damping_b = loser_damping
                winner_id = None
            elif winner_type == type_a:
                damping_a = 1.0  # Winner keeps full adjustment
                damping_b = loser_damping
                winner_id = rule_a_id
            else:
                damping_a = loser_damping
                damping_b = 1.0
                winner_id = rule_b_id
            
            # Same-crew conflicts get extra damping (more severe)
            if is_same_crew:
                damping_a *= 0.8
                damping_b *= 0.8
            
            return ResolutionResult(
                rule_a_id=rule_a_id,
                rule_b_id=rule_b_id,
                rule_a_type=type_a,
                rule_b_type=type_b,
                winner_id=winner_id,
                damping_a=damping_a,
                damping_b=damping_b,
                strategy_used=strategy["description"],
                is_same_crew=is_same_crew,
            )
        
        # No known strategy - use priority-based resolution
        priority_a = self.get_priority(type_a)
        priority_b = self.get_priority(type_b)
        
        if priority_a > priority_b:
            damping_a = 1.0
            damping_b = 0.5  # Default damping for lower priority
            winner_id = rule_a_id
        elif priority_b > priority_a:
            damping_a = 0.5
            damping_b = 1.0
            winner_id = rule_b_id
        else:
            # Equal priority - both get light damping
            damping_a = 0.8
            damping_b = 0.8
            winner_id = None
        
        if is_same_crew:
            damping_a *= 0.8
            damping_b *= 0.8
        
        return ResolutionResult(
            rule_a_id=rule_a_id,
            rule_b_id=rule_b_id,
            rule_a_type=type_a,
            rule_b_type=type_b,
            winner_id=winner_id,
            damping_a=damping_a,
            damping_b=damping_b,
            strategy_used=f"Priority-based: {type_a}({priority_a}) vs {type_b}({priority_b})",
            is_same_crew=is_same_crew,
        )
    
    def process_conflicts(self, conflicts: List[ConflictPair]) -> Dict[int, float]:
        """Process all conflicts and compute per-rule damping factors.
        
        Returns a dict mapping rule_id -> damping_factor (0-1).
        Rules not in conflict get factor 1.0 (no damping).
        """
        self.conflict_dampings.clear()
        
        for conflict in conflicts:
            result = self.resolve(conflict)
            
            # Accumulate damping (use minimum if rule in multiple conflicts)
            if result.rule_a_id in self.conflict_dampings:
                self.conflict_dampings[result.rule_a_id] = min(
                    self.conflict_dampings[result.rule_a_id],
                    result.damping_a
                )
            else:
                self.conflict_dampings[result.rule_a_id] = result.damping_a
            
            if result.rule_b_id in self.conflict_dampings:
                self.conflict_dampings[result.rule_b_id] = min(
                    self.conflict_dampings[result.rule_b_id],
                    result.damping_b
                )
            else:
                self.conflict_dampings[result.rule_b_id] = result.damping_b
        
        return self.conflict_dampings
    
    def get_damping(self, rule_id: int) -> float:
        """Get the damping factor for a specific rule.
        
        Returns 1.0 if rule is not in any conflict.
        """
        return self.conflict_dampings.get(rule_id, 1.0)
    
    def flag_persistent(self, conflicts: List[ConflictPair], dates_seen: int, min_dates: int = 2) -> List[ConflictPair]:
        """Flag conflicts that appear on all analyzed dates.
        
        These are systemic conflicts that may need human review.
        """
        self.persistent_conflicts = []
        
        for conflict in conflicts:
            # Check if this conflict appears on all dates
            # (The analyzer already tags these, we just track them)
            if conflict.rule_a_info.get("persistent", False):
                self.persistent_conflicts.append(conflict)
                self.flagged_rules.add(conflict.rule_a_id)
                self.flagged_rules.add(conflict.rule_b_id)
        
        return self.persistent_conflicts
    
    def get_resolution_summary(self, conflicts: List[ConflictPair]) -> Dict:
        """Generate a summary of conflict resolutions for reporting."""
        resolutions = [self.resolve(c) for c in conflicts]
        
        # Count by strategy
        strategy_counts: Dict[str, int] = {}
        same_crew_count = 0
        total_damped = 0
        
        for r in resolutions:
            strategy_counts[r.strategy_used] = strategy_counts.get(r.strategy_used, 0) + 1
            if r.is_same_crew:
                same_crew_count += 1
            if r.damping_a < 1.0:
                total_damped += 1
            if r.damping_b < 1.0:
                total_damped += 1
        
        return {
            "total_conflicts": len(conflicts),
            "same_crew_conflicts": same_crew_count,
            "rules_damped": total_damped,
            "strategies_used": strategy_counts,
            "flagged_for_review": len(self.flagged_rules),
        }


def apply_conflict_aware_damping(
    weights: Dict[int, float],
    satisfactions: Dict[int, float],
    resolver: ConflictResolver,
    alpha: float = 0.3,
    boost: float = 10.0,
    decay: float = 0.98,
) -> Dict[int, float]:
    """Apply weight updates with conflict-aware damping.
    
    This is an enhanced version of damped_update that considers conflicts.
    
    Args:
        weights: Current rule weights {rule_id: weight}
        satisfactions: Current satisfaction scores {rule_id: 0-1}
        resolver: ConflictResolver with computed dampings
        alpha: Base learning rate (0-1)
        boost: Max weight increase for unsatisfied rules
        decay: Weight decay for satisfied rules
    
    Returns:
        Updated weights dict
    """
    new_weights = {}
    
    for rule_id, current_weight in weights.items():
        satisfaction = satisfactions.get(rule_id, 1.0)
        damping = resolver.get_damping(rule_id)
        
        if satisfaction < 1.0:
            # Rule not fully satisfied - increase weight
            # Apply conflict damping to reduce oscillation
            effective_boost = boost * damping
            target = current_weight + effective_boost * (1.0 - satisfaction)
        else:
            # Rule satisfied - slight decay
            target = current_weight * decay
        
        # Damped update with conflict-aware alpha
        effective_alpha = alpha * damping
        new_weights[rule_id] = current_weight + effective_alpha * (target - current_weight)
    
    return new_weights
