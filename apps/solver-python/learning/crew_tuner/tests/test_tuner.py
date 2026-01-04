from __future__ import annotations

from learning.crew_tuner.tuner import compute_weight_overrides


def test_empty_role_rules_returns_empty_multipliers() -> None:
    overrides = compute_weight_overrides({"roleRules": []})
    assert overrides["mult_by_rule_type"] == {}


def test_minority_type_gets_higher_multiplier() -> None:
    # 3 of type A, 1 of type B
    day_ctx = {
        "roleRules": [
            {"type": "A"},
            {"type": "A"},
            {"type": "A"},
            {"type": "B"},
        ]
    }

    overrides = compute_weight_overrides(day_ctx)
    mult = overrides["mult_by_rule_type"]

    assert mult["B"] > mult["A"]

    mean = (mult["A"] + mult["B"]) / 2.0
    assert abs(mean - 1.0) < 1e-9
