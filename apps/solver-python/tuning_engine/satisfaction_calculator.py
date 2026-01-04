"""Satisfaction Calculator: Computes true satisfaction metrics for a schedule.

The raw satisfaction vector from rule_evaluator includes ALL rules, but many
rules are "not eligible" (e.g., TIMING for a role that wasn't assigned).
These ineligible rules shouldn't count against satisfaction.

This module provides:
  - True satisfaction percentage (eligible rules only)
  - Breakdown by rule type
  - Per-crew satisfaction
  - Fairness metrics across crew
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .rule_evaluator import RuleSatisfaction, evaluate_all_rules


@dataclass
class SatisfactionSummary:
    """Summary of satisfaction metrics for a schedule."""
    
    # Overall metrics (eligible rules only)
    total_rules: int = 0
    eligible_rules: int = 0
    satisfied_rules: int = 0  # eligible rules with satisfaction >= 0.5
    satisfaction_percent: float = 0.0  # satisfied_rules / eligible_rules * 100
    
    # Breakdown by rule type
    by_rule_type: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    
    # Per-crew breakdown
    by_crew: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    
    # Fairness
    fairness_index: float = 0.0  # 0-100, 100 = perfect equality
    
    # Raw data for debugging
    ineligible_rules: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "totalRules": self.total_rules,
            "eligibleRules": self.eligible_rules,
            "ineligibleRules": self.ineligible_rules,
            "satisfiedRules": self.satisfied_rules,
            "satisfactionPercent": round(self.satisfaction_percent, 2),
            "fairnessIndex": round(self.fairness_index, 2),
            "byRuleType": self.by_rule_type,
            "byCrew": self.by_crew,
        }


def calculate_satisfaction(
    role_rules: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
    crew: List[Dict[str, Any]],
    roles: List[Dict[str, Any]] | None = None,
) -> SatisfactionSummary:
    """Calculate true satisfaction metrics for a schedule.
    
    Args:
        role_rules: List of role rules from solver input
        assignments: List of assignments from solver output
        crew: List of crew with shift info
        roles: List of roles with familyId (for DISTRIBUTION)
    
    Returns:
        SatisfactionSummary with all metrics
    """
    # Get all rule evaluations
    results = evaluate_all_rules(role_rules, assignments, crew, roles)
    
    return calculate_satisfaction_from_results(results)


def calculate_satisfaction_from_results(
    results: List[RuleSatisfaction],
) -> SatisfactionSummary:
    """Calculate satisfaction from pre-evaluated results.
    
    Useful when you already have RuleSatisfaction objects.
    """
    summary = SatisfactionSummary()
    summary.total_rules = len(results)
    
    # Accumulators
    by_type: Dict[str, Dict[str, int]] = defaultdict(lambda: {"eligible": 0, "satisfied": 0, "total": 0})
    by_crew: Dict[str, Dict[str, int]] = defaultdict(lambda: {"eligible": 0, "satisfied": 0, "total": 0})
    crew_satisfaction_scores: Dict[str, float] = {}
    
    for r in results:
        rule_type = r.rule_type
        crew_id = r.crew_id
        
        by_type[rule_type]["total"] += 1
        by_crew[crew_id]["total"] += 1
        
        if r.eligible:
            summary.eligible_rules += 1
            by_type[rule_type]["eligible"] += 1
            by_crew[crew_id]["eligible"] += 1
            
            if r.satisfaction >= 0.5:
                summary.satisfied_rules += 1
                by_type[rule_type]["satisfied"] += 1
                by_crew[crew_id]["satisfied"] += 1
        else:
            summary.ineligible_rules += 1
    
    # Calculate overall satisfaction percent
    if summary.eligible_rules > 0:
        summary.satisfaction_percent = (summary.satisfied_rules / summary.eligible_rules) * 100
    
    # Build by_rule_type breakdown
    for rule_type, counts in by_type.items():
        eligible = counts["eligible"]
        satisfied = counts["satisfied"]
        pct = (satisfied / eligible * 100) if eligible > 0 else 0.0
        summary.by_rule_type[rule_type] = {
            "total": counts["total"],
            "eligible": eligible,
            "satisfied": satisfied,
            "percent": round(pct, 2),
        }
    
    # Build by_crew breakdown
    for crew_id, counts in by_crew.items():
        eligible = counts["eligible"]
        satisfied = counts["satisfied"]
        pct = (satisfied / eligible * 100) if eligible > 0 else 0.0
        summary.by_crew[crew_id] = {
            "total": counts["total"],
            "eligible": eligible,
            "satisfied": satisfied,
            "percent": round(pct, 2),
        }
        crew_satisfaction_scores[crew_id] = pct
    
    # Calculate fairness index (Gini-based, inverted so 100 = perfect equality)
    if crew_satisfaction_scores:
        summary.fairness_index = _calculate_fairness_index(list(crew_satisfaction_scores.values()))
    
    return summary


def _calculate_fairness_index(scores: List[float]) -> float:
    """Calculate fairness index from per-crew satisfaction scores.
    
    Uses Gini coefficient, inverted so:
      - 100 = perfect equality (everyone has same satisfaction)
      - 0 = maximum inequality (one person has all, others have none)
    
    Returns:
        Float 0-100
    """
    if not scores or len(scores) == 1:
        return 100.0
    
    n = len(scores)
    sorted_scores = sorted(scores)
    
    # Handle all-zero case
    if all(s == 0 for s in sorted_scores):
        return 100.0  # Everyone equally unsatisfied
    
    # Gini coefficient calculation
    cumulative_sum = 0.0
    for i, score in enumerate(sorted_scores):
        cumulative_sum += (2 * (i + 1) - n - 1) * score
    
    mean = sum(sorted_scores) / n
    if mean == 0:
        return 100.0
    
    gini = cumulative_sum / (n * n * mean)
    
    # Invert: 0 Gini = 100 fairness, 1 Gini = 0 fairness
    return (1 - gini) * 100


def get_satisfaction_vector_with_eligibility(
    role_rules: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
    crew: List[Dict[str, Any]],
    roles: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    """Get satisfaction vector with separate eligibility mask.
    
    Returns:
        {
            "satisfaction": [1, 0, 1, 0, ...],  # 0 or 1 for each rule
            "eligible": [True, True, False, ...],  # whether rule was applicable
            "ruleIds": [1, 2, 3, ...],  # matching rule IDs
        }
    
    This allows the tuning engine to:
      - Use full vector for weight updates (all rules)
      - Use eligibility mask for reporting true satisfaction
    """
    results = evaluate_all_rules(role_rules, assignments, crew, roles)
    
    return {
        "satisfaction": [1 if r.satisfaction >= 0.5 else 0 for r in results],
        "eligible": [r.eligible for r in results],
        "ruleIds": [r.rule_id for r in results],
        "ruleTypes": [r.rule_type for r in results],
        "crewIds": [r.crew_id for r in results],
    }


def print_satisfaction_report(summary: SatisfactionSummary) -> None:
    """Print a human-readable satisfaction report."""
    print("\n" + "=" * 60)
    print("SATISFACTION REPORT")
    print("=" * 60)
    
    print(f"\nOverall: {summary.satisfied_rules}/{summary.eligible_rules} eligible rules satisfied "
          f"({summary.satisfaction_percent:.1f}%)")
    print(f"  - Total rules: {summary.total_rules}")
    print(f"  - Ineligible (not applicable): {summary.ineligible_rules}")
    print(f"  - Fairness Index: {summary.fairness_index:.1f}/100")
    
    print("\nBy Rule Type:")
    print("-" * 50)
    for rule_type, data in sorted(summary.by_rule_type.items()):
        print(f"  {rule_type}: {data['satisfied']}/{data['eligible']} ({data['percent']:.1f}%)")
    
    if len(summary.by_crew) <= 10:  # Only show if reasonable number of crew
        print("\nBy Crew:")
        print("-" * 50)
        for crew_id, data in sorted(summary.by_crew.items()):
            print(f"  {crew_id}: {data['satisfied']}/{data['eligible']} ({data['percent']:.1f}%)")
    
    print("\n" + "=" * 60)
