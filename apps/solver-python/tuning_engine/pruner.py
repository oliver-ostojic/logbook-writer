"""Module 4: The Pruner.

Responsibilities:
- Detect stagnant rules that remain unsatisfied across iterations
- Lock rules that are consistently satisfied (no need to tune)
- Prevent wasted solver effort on unchangeable rules
"""

from __future__ import annotations

from typing import List, Set


# ---------------------------------------------------------------------------
# Stagnation Detection
# ---------------------------------------------------------------------------


def detect_stagnant_rules(
    satisfaction_history: List[List[int]],
    rule_count: int,
    consecutive_zeros: int = 3,
) -> List[int]:
    """Find rules that have been unsatisfied for N consecutive iterations.

    These rules may be fundamentally blocked (e.g., conflicts with constraints)
    and may warrant manual review or reduced priority.

    Args:
        satisfaction_history: list of satisfaction vectors, oldest first
        rule_count: total number of rules
        consecutive_zeros: how many iterations of 0 before flagging

    Returns:
        List of rule indices that are stagnant.
    """
    if len(satisfaction_history) < consecutive_zeros:
        return []

    recent = satisfaction_history[-consecutive_zeros:]
    stagnant: List[int] = []

    for rule_idx in range(rule_count):
        all_zero = all(
            (vec[rule_idx] if rule_idx < len(vec) else 0) == 0
            for vec in recent
        )
        if all_zero:
            stagnant.append(rule_idx)

    return stagnant


def detect_stable_rules(
    satisfaction_history: List[List[int]],
    rule_count: int,
    consecutive_ones: int = 3,
) -> List[int]:
    """Find rules that have been satisfied for N consecutive iterations.

    These rules are stable and can be locked to reduce tuning noise.

    Args:
        satisfaction_history: list of satisfaction vectors, oldest first
        rule_count: total number of rules
        consecutive_ones: how many iterations of 1 before flagging

    Returns:
        List of rule indices that are stable.
    """
    if len(satisfaction_history) < consecutive_ones:
        return []

    recent = satisfaction_history[-consecutive_ones:]
    stable: List[int] = []

    for rule_idx in range(rule_count):
        all_one = all(
            (vec[rule_idx] if rule_idx < len(vec) else 0) == 1
            for vec in recent
        )
        if all_one:
            stable.append(rule_idx)

    return stable


# ---------------------------------------------------------------------------
# Rule Locking
# ---------------------------------------------------------------------------


def lock_rules(
    weights: dict,
    rule_ids: List[int],
    locked_set: Set[int],
) -> Set[int]:
    """Add rules to the locked set.

    Locked rules have their weights frozen and are excluded from tuning.

    Returns:
        Updated locked set.
    """
    return locked_set | set(rule_ids)


def filter_unlocked_weights(
    weights: dict,
    locked_set: Set[int],
) -> dict:
    """Return a new weights dict excluding locked rules.

    Useful when passing weights to tuning functions.
    """
    return {k: v for k, v in weights.items() if k not in locked_set}
