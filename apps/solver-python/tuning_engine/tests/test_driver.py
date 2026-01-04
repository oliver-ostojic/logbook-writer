"""Tests for Module 1: The Driver."""

import pytest

from tuning_engine.driver import (
    global_score,
    naive_tune,
    vectorize_satisfaction,
)


class TestVectorizeSatisfaction:
    """Tests for vectorize_satisfaction."""

    def test_empty_rules_returns_empty_list(self):
        """No rules means empty vector."""
        result = vectorize_satisfaction([], [])
        assert result == []

    def test_empty_assignments_returns_empty_list(self):
        """No assignments means no evaluations - returns empty list."""
        rules = [{"id": 1}, {"id": 2}, {"id": 3}]
        result = vectorize_satisfaction([], rules)
        # With no assignments to evaluate against, rule_evaluator returns empty
        assert result == []


class TestGlobalScore:
    """Tests for global_score."""

    def test_empty_rules_returns_one(self):
        """Vacuously satisfied."""
        result = global_score([], {}, [])
        assert result == 1.0

    def test_all_satisfied_returns_one(self):
        """All rules satisfied => score = 1.0."""
        rules = [{"id": 1}, {"id": 2}]
        satisfaction = [1, 1]
        weights = {1: 1.0, 2: 1.0}
        result = global_score(satisfaction, weights, rules)
        assert result == 1.0

    def test_none_satisfied_returns_zero(self):
        """No rules satisfied => score = 0.0."""
        rules = [{"id": 1}, {"id": 2}]
        satisfaction = [0, 0]
        weights = {1: 1.0, 2: 1.0}
        result = global_score(satisfaction, weights, rules)
        assert result == 0.0

    def test_weighted_average(self):
        """Weighted average: (1*2 + 0*1) / (2+1) = 2/3."""
        rules = [{"id": 1}, {"id": 2}]
        satisfaction = [1, 0]
        weights = {1: 2.0, 2: 1.0}
        result = global_score(satisfaction, weights, rules)
        assert abs(result - (2 / 3)) < 1e-9


class TestNaiveTune:
    """Tests for naive_tune."""

    def test_unsatisfied_rules_get_boosted(self):
        """Unsatisfied rules should have weight increased by step."""
        rules = [{"id": 1}, {"id": 2}]
        satisfaction = [0, 1]
        weights = {1: 1.0, 2: 1.0}
        result = naive_tune(satisfaction, weights, rules, step=0.5)
        assert result[1] == 1.5  # unsatisfied, boosted
        assert result[2] == 1.0  # satisfied, unchanged

    def test_all_satisfied_no_change(self):
        """All satisfied => weights unchanged."""
        rules = [{"id": 1}, {"id": 2}]
        satisfaction = [1, 1]
        weights = {1: 1.0, 2: 2.0}
        result = naive_tune(satisfaction, weights, rules, step=0.5)
        assert result == weights
