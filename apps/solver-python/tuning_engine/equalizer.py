"""Module 3: The Equalizer.

Responsibilities:
- Calculate Gini coefficient to measure fairness across crew
- Apply fairness-based weighting to prioritize underserved crew
"""

from __future__ import annotations

from typing import Dict, List


# ---------------------------------------------------------------------------
# Gini Coefficient
# ---------------------------------------------------------------------------


def gini_coefficient(values: List[float]) -> float:
    """Compute the Gini coefficient for a list of values.

    Gini = 0  => perfect equality (everyone has the same)
    Gini = 1  => maximum inequality (one person has everything)

    Formula (sorted):
        G = (2 * Σ(i * x_i)) / (n * Σ x_i) - (n + 1) / n

    Args:
        values: list of numeric values (e.g., per-crew satisfaction scores)

    Returns:
        Gini coefficient in [0, 1].
    """
    if not values:
        return 0.0

    n = len(values)
    sorted_vals = sorted(values)
    total = sum(sorted_vals)

    if total == 0:
        return 0.0  # Everyone has zero, technically equal

    numerator = sum((i + 1) * v for i, v in enumerate(sorted_vals))
    gini = (2 * numerator) / (n * total) - (n + 1) / n
    return max(0.0, min(1.0, gini))  # clamp to [0, 1]


# ---------------------------------------------------------------------------
# Fairness Weighting
# ---------------------------------------------------------------------------


def crew_satisfaction_scores(
    satisfaction: List[int],
    rules: List[Dict],
) -> Dict[str, float]:
    """Aggregate satisfaction per crew member.

    Returns dict mapping crewId -> average satisfaction for that crew's rules.
    """
    crew_sums: Dict[str, float] = {}
    crew_counts: Dict[str, int] = {}

    for i, rule in enumerate(rules):
        crew_id = rule.get("crewId")
        if not crew_id:
            continue
        s = satisfaction[i] if i < len(satisfaction) else 0
        crew_sums[crew_id] = crew_sums.get(crew_id, 0.0) + s
        crew_counts[crew_id] = crew_counts.get(crew_id, 0) + 1

    result: Dict[str, float] = {}
    for cid, total in crew_sums.items():
        count = crew_counts.get(cid, 1)
        result[cid] = total / count if count > 0 else 0.0

    return result


def apply_fairness_multiplier(
    weights: Dict[int, float],
    rules: List[Dict],
    crew_standings: Dict[str, float],
) -> Dict[int, float]:
    """Boost weights for underserved crew members.

    Crew with lower satisfaction scores get a higher multiplier on their rules.

    Strategy: multiplier = 1 + (1 - standing) where standing is normalized [0,1]
    """
    if not crew_standings:
        return dict(weights)

    min_standing = min(crew_standings.values())
    max_standing = max(crew_standings.values())
    range_standing = max_standing - min_standing if max_standing > min_standing else 1.0

    new_weights = dict(weights)

    for i, rule in enumerate(rules):
        rule_id = rule.get("id", i)
        crew_id = rule.get("crewId")

        if crew_id and crew_id in crew_standings:
            standing = crew_standings[crew_id]
            # Normalize to [0, 1]
            normalized = (standing - min_standing) / range_standing
            # Underserved (low standing) gets boost
            multiplier = 1.0 + (1.0 - normalized)
            new_weights[rule_id] = weights.get(rule_id, 1.0) * multiplier

    return new_weights
