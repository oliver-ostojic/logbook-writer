"""Lightweight self-test for tuning_engine.rule_evaluator.

This repo doesn't always have pytest available in the runtime environment used
by ad-hoc scripts. This file provides a minimal sanity check you can run with:

    python3 -m tuning_engine.self_test_rule_evaluator

It exits non-zero if any assertion fails.
"""

from __future__ import annotations

from tuning_engine.rule_evaluator import evaluate_rules_to_vector


def test_max_consecutive_vectorization_requires_reaching_target() -> None:
    rules = [
        {"id": 2, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120},
    ]
    crew = [{"id": "crew-1"}]

    # Below target => 0
    assignments_below = [
        {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
    ]
    assert evaluate_rules_to_vector(rules, assignments_below, crew) == [0]

    # At target => 1
    assignments_at = [
        {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
        {"crewId": "crew-1", "roleId": 1, "startMinute": 540, "endMinute": 600},
    ]
    assert evaluate_rules_to_vector(rules, assignments_at, crew) == [1]

    # Invalid target => always unsatisfied
    rules_invalid = [
        {"id": 3, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 0},
    ]
    assert evaluate_rules_to_vector(rules_invalid, assignments_at, crew) == [0]


def main() -> None:
    test_max_consecutive_vectorization_requires_reaching_target()
    print("OK: self_test_rule_evaluator")


if __name__ == "__main__":
    main()
