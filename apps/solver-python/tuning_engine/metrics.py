from typing import List, Dict, Any, Tuple
from .rule_evaluator import evaluate_all_rules

def vectorize_satisfaction(assignments: List[Dict[str, Any]], crew_rules: List[Dict[str, Any]], crew: List[Dict[str, Any]]) -> List[float]:
    """
    Helper to get a list of satisfaction scores (1.0 or 0.0) for all eligible rules.
    Returns a list of floats. -1.0 indicates ineligible.
    """
    results = evaluate_all_rules(crew_rules, assignments, crew)
    # We need to map results back to the order of crew_rules if we want strict alignment,
    # but for counts we just need the values.
    # The evaluate_all_rules returns a list of RuleEvaluationResult.
    return [r.satisfaction if r.eligible else -1.0 for r in results]

def satisfaction_counts(assignments: List[Dict[str, Any]], crew_rules: List[Dict[str, Any]], crew: List[Dict[str, Any]]) -> Tuple[int, int]:
    sat = vectorize_satisfaction(assignments, crew_rules, crew)
    eligible = sum(1 for s in sat if s >= 0)
    satisfied = sum(1 for s in sat if s == 1)
    return satisfied, eligible

def per_crew_satisfaction(assignments: List[Dict[str, Any]], crew_rules: List[Dict[str, Any]], crew: List[Dict[str, Any]]) -> Dict[str, Tuple[int, int]]:
    """Compute per-crew satisfaction: {crewId: (satisfied, eligible)}."""
    results = evaluate_all_rules(crew_rules, assignments, crew)
    crew_stats: Dict[str, List[Tuple[float, bool]]] = {}
    
    for r in results:
        if r.crew_id not in crew_stats:
            crew_stats[r.crew_id] = []
        crew_stats[r.crew_id].append((r.satisfaction, r.eligible))
    
    # Convert to (satisfied, eligible) counts
    per_crew: Dict[str, Tuple[int, int]] = {}
    for cid, vals in crew_stats.items():
        eligible_count = sum(1 for _, elig in vals if elig)
        satisfied_count = sum(1 for sat, elig in vals if elig and sat >= 1.0)
        per_crew[cid] = (satisfied_count, eligible_count)
    
    return per_crew

def fairness_stats(per_crew: Dict[str, Tuple[int, int]]) -> Tuple[float, float, float, float]:
    """Compute fairness metrics: (min_pct, max_pct, spread, fairness_index).
    
    Returns percentages (0-100) for min satisfaction, max satisfaction, spread,
    and fairness_index (100 = perfect equality, 0 = max inequality).
    Only includes crew with at least 1 eligible rule.
    """
    pcts = []
    for cid, (sat, elig) in per_crew.items():
        if elig > 0:
            pcts.append(100.0 * sat / elig)
    
    if not pcts:
        return 0.0, 0.0, 0.0, 100.0
    
    # Calculate Gini-based fairness index
    n = len(pcts)
    if n == 1:
        fairness_index = 100.0
    else:
        sorted_pcts = sorted(pcts)
        if all(p == 0 for p in sorted_pcts):
            fairness_index = 100.0
        else:
            cumulative_sum = 0.0
            for i, p in enumerate(sorted_pcts):
                cumulative_sum += (2 * (i + 1) - n - 1) * p
            mean = sum(sorted_pcts) / n
            if mean == 0:
                fairness_index = 100.0
            else:
                gini = cumulative_sum / (n * n * mean)
                fairness_index = (1 - gini) * 100
    
    return min(pcts), max(pcts), max(pcts) - min(pcts), fairness_index
