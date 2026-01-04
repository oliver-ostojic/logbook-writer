"""Crew tuner (V1): compute weight overrides from crew role rules.

This module is intended to run *immediately before* the solver.

Input:
- day_ctx: solver payload dict
  - must include `roleRules`: a list of crew-scoped role rule descriptors

Output:
- weight_overrides dict, used by the solver to scale objective terms.

V1 output shape:
{
  "mult_by_rule_type": {"TIMING": 1.2, ...},
  "metadata": {...}
}

Note: For now, we compute multipliers at the **rule type** level.
Per-rule (id-level) weights can be added in V2.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Tuple


def _extract_rule_type(rule: Dict[str, Any]) -> str | None:
    t = rule.get("type")
    if t is None:
        return None
    return str(t)


def compute_rule_type_counts_from_role_rules(day_ctx: Dict[str, Any]) -> Counter[str]:
    """Count role rule types across crew-scoped roleRules.

    Assumes `day_ctx["roleRules"]` has already expanded store+crew rules into a
    per-crew list (as the API builder does).
    """

    role_rules: List[Dict[str, Any]] = list(day_ctx.get("roleRules") or [])
    counts: Counter[str] = Counter()

    for rule in role_rules:
        t = _extract_rule_type(rule)
        if t:
            counts[t] += 1

    return counts


def compute_rule_type_shares(day_ctx: Dict[str, Any]) -> Dict[str, float]:
    counts = compute_rule_type_counts_from_role_rules(day_ctx)
    total = sum(counts.values())
    if total <= 0:
        return {}
    return {t: (counts[t] / float(total)) for t in counts.keys()}


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def compute_inverse_sqrt_multipliers(
    shares: Dict[str, float],
    *,
    eps: float = 1e-6,
    min_mult: float = 0.5,
    max_mult: float = 2.0,
) -> Tuple[Dict[str, float], Dict[str, float]]:
    """Compute clamp+mean-normalized multipliers from shares."""

    import math

    raw: Dict[str, float] = {}
    for t, share in shares.items():
        raw[t] = _clamp(1.0 / math.sqrt(float(share) + eps), min_mult, max_mult)

    if not raw:
        return {}, {}

    mean_raw = sum(raw.values()) / float(len(raw))
    if mean_raw <= 0:
        return {k: 1.0 for k in raw}, raw

    normalized = {k: (v / mean_raw) for k, v in raw.items()}
    return normalized, raw


def compute_weight_overrides(day_ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Public API: compute weight overrides for a day solve payload."""

    shares = compute_rule_type_shares(day_ctx)
    mult_by_rule_type, raw_mult = compute_inverse_sqrt_multipliers(shares)

    return {
        "mult_by_rule_type": mult_by_rule_type,
        "metadata": {
            "policy": "inverse_sqrt_frequency_v1",
            "shares": shares,
            "raw_mult_by_rule_type": raw_mult,
            "active_types": sorted(mult_by_rule_type.keys()),
            "num_role_rules": len(day_ctx.get("roleRules") or []),
        },
    }
