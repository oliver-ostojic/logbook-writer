"""Tuning Engine for Logbook Writer.

A feedback control loop that iteratively adjusts CrewRoleRule weights
to maximize global satisfaction while maintaining fairness.

Modules:
- driver: Core loop + vectorizer + global score (Module 1)
- rule_evaluator: Post-solve satisfaction evaluation for all rule types
- satisfaction_calculator: True satisfaction metrics (eligible rules only)
- stabilizer: Difference matrix, Hamming distance, damped tuning (Module 2)
- equalizer: Gini coefficient + fairness weighting (Module 3)
- pruner: Stagnation detection + rule locking (Module 4)
"""

from .driver import global_score, naive_tune, run_tuning_loop, vectorize_satisfaction
from .equalizer import apply_fairness_multiplier, crew_satisfaction_scores, gini_coefficient
from .pruner import detect_stable_rules, detect_stagnant_rules, filter_unlocked_weights, lock_rules
from .rule_evaluator import RuleSatisfaction, evaluate_all_rules, evaluate_rules_to_vector
from .satisfaction_calculator import (
    SatisfactionSummary,
    calculate_satisfaction,
    calculate_satisfaction_from_results,
    get_satisfaction_vector_with_eligibility,
    print_satisfaction_report,
)
from .stabilizer import (
    ConflictPair,
    RuleStatus,
    apply_conflict_resolution,
    classify_rules,
    damped_tune,
    damped_update,
    detect_conflicts,
    difference_matrix,
    hamming_distance,
    print_conflict_report,
)
from .types import CrewRoleRuleRecord, TuningState

__all__ = [
    # Types
    "CrewRoleRuleRecord",
    "TuningState",
    # Driver (Module 1)
    "vectorize_satisfaction",
    "global_score",
    "naive_tune",
    "run_tuning_loop",
    # Rule Evaluator
    "RuleSatisfaction",
    "evaluate_all_rules",
    "evaluate_rules_to_vector",
    # Satisfaction Calculator
    "SatisfactionSummary",
    "calculate_satisfaction",
    "calculate_satisfaction_from_results",
    "get_satisfaction_vector_with_eligibility",
    "print_satisfaction_report",
    # Stabilizer (Module 2)
    "difference_matrix",
    "hamming_distance",
    "damped_update",
    "damped_tune",
    "RuleStatus",
    "classify_rules",
    "ConflictPair",
    "detect_conflicts",
    "apply_conflict_resolution",
    "print_conflict_report",
    # Equalizer (Module 3)
    "gini_coefficient",
    "crew_satisfaction_scores",
    "apply_fairness_multiplier",
    # Pruner (Module 4)
    "detect_stagnant_rules",
    "detect_stable_rules",
    "lock_rules",
    "filter_unlocked_weights",
]
