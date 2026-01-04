"""Tests for Module 3: The Equalizer."""

import pytest

from tuning_engine.equalizer import (
    apply_fairness_multiplier,
    crew_satisfaction_scores,
    gini_coefficient,
)


class TestGiniCoefficient:
    """Tests for gini_coefficient."""

    def test_empty_list(self):
        """Empty list => 0 (no inequality to measure)."""
        result = gini_coefficient([])
        assert result == 0.0

    def test_all_equal(self):
        """Perfect equality => Gini = 0."""
        result = gini_coefficient([1.0, 1.0, 1.0, 1.0])
        assert abs(result) < 1e-9

    def test_all_zeros(self):
        """All zeros => technically equal, Gini = 0."""
        result = gini_coefficient([0.0, 0.0, 0.0])
        assert result == 0.0

    def test_maximum_inequality(self):
        """One person has everything => Gini approaches 1."""
        result = gini_coefficient([0.0, 0.0, 0.0, 100.0])
        assert result > 0.5  # Should be high inequality

    def test_moderate_inequality(self):
        """Some inequality."""
        result = gini_coefficient([1.0, 2.0, 3.0, 4.0])
        assert 0.0 < result < 1.0


class TestCrewSatisfactionScores:
    """Tests for crew_satisfaction_scores."""

    def test_empty(self):
        """No rules => empty result."""
        result = crew_satisfaction_scores([], [])
        assert result == {}

    def test_single_crew(self):
        """Single crew with multiple rules."""
        rules = [
            {"id": 1, "crewId": "crew_a"},
            {"id": 2, "crewId": "crew_a"},
        ]
        satisfaction = [1, 0]
        result = crew_satisfaction_scores(satisfaction, rules)
        assert result["crew_a"] == 0.5

    def test_multiple_crews(self):
        """Multiple crews."""
        rules = [
            {"id": 1, "crewId": "crew_a"},
            {"id": 2, "crewId": "crew_b"},
        ]
        satisfaction = [1, 0]
        result = crew_satisfaction_scores(satisfaction, rules)
        assert result["crew_a"] == 1.0
        assert result["crew_b"] == 0.0


class TestApplyFairnessMultiplier:
    """Tests for apply_fairness_multiplier."""

    def test_empty_standings(self):
        """No standings => weights unchanged."""
        weights = {1: 1.0, 2: 2.0}
        result = apply_fairness_multiplier(weights, [], {})
        assert result == weights

    def test_underserved_gets_boost(self):
        """Crew with lower standing gets higher multiplier."""
        rules = [
            {"id": 1, "crewId": "crew_a"},
            {"id": 2, "crewId": "crew_b"},
        ]
        weights = {1: 1.0, 2: 1.0}
        standings = {"crew_a": 0.0, "crew_b": 1.0}  # a is underserved
        result = apply_fairness_multiplier(weights, rules, standings)
        # crew_a (standing=0) gets multiplier 2.0, crew_b (standing=1) gets 1.0
        assert result[1] == 2.0
        assert result[2] == 1.0
