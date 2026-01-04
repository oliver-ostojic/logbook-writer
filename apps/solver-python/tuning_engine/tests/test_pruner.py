"""Tests for Module 4: The Pruner."""

import pytest

from tuning_engine.pruner import (
    detect_stable_rules,
    detect_stagnant_rules,
    filter_unlocked_weights,
    lock_rules,
)


class TestDetectStagnantRules:
    """Tests for detect_stagnant_rules."""

    def test_not_enough_history(self):
        """Fewer iterations than threshold => empty result."""
        history = [[0, 0], [0, 0]]
        result = detect_stagnant_rules(history, rule_count=2, consecutive_zeros=3)
        assert result == []

    def test_all_stagnant(self):
        """All rules have been 0 for N iterations."""
        history = [[0, 0], [0, 0], [0, 0]]
        result = detect_stagnant_rules(history, rule_count=2, consecutive_zeros=3)
        assert result == [0, 1]

    def test_some_stagnant(self):
        """Only some rules are stagnant."""
        history = [[1, 0], [1, 0], [1, 0]]
        result = detect_stagnant_rules(history, rule_count=2, consecutive_zeros=3)
        assert result == [1]

    def test_none_stagnant(self):
        """No rules are stagnant."""
        history = [[1, 1], [1, 1], [1, 1]]
        result = detect_stagnant_rules(history, rule_count=2, consecutive_zeros=3)
        assert result == []


class TestDetectStableRules:
    """Tests for detect_stable_rules."""

    def test_all_stable(self):
        """All rules satisfied for N iterations."""
        history = [[1, 1], [1, 1], [1, 1]]
        result = detect_stable_rules(history, rule_count=2, consecutive_ones=3)
        assert result == [0, 1]

    def test_none_stable(self):
        """No rules consistently satisfied."""
        history = [[0, 0], [0, 0], [0, 0]]
        result = detect_stable_rules(history, rule_count=2, consecutive_ones=3)
        assert result == []

    def test_some_stable(self):
        """Only some rules stable."""
        history = [[1, 0], [1, 0], [1, 0]]
        result = detect_stable_rules(history, rule_count=2, consecutive_ones=3)
        assert result == [0]


class TestLockRules:
    """Tests for lock_rules."""

    def test_add_to_empty_set(self):
        """Lock rules into empty set."""
        result = lock_rules({}, [1, 2], set())
        assert result == {1, 2}

    def test_add_to_existing_set(self):
        """Lock rules into existing set."""
        result = lock_rules({}, [3], {1, 2})
        assert result == {1, 2, 3}

    def test_no_duplicates(self):
        """Adding existing rule doesn't duplicate."""
        result = lock_rules({}, [1, 2], {1})
        assert result == {1, 2}


class TestFilterUnlockedWeights:
    """Tests for filter_unlocked_weights."""

    def test_no_locked(self):
        """No locked rules => all weights returned."""
        weights = {1: 1.0, 2: 2.0}
        result = filter_unlocked_weights(weights, set())
        assert result == weights

    def test_some_locked(self):
        """Locked rules excluded."""
        weights = {1: 1.0, 2: 2.0, 3: 3.0}
        result = filter_unlocked_weights(weights, {2})
        assert result == {1: 1.0, 3: 3.0}

    def test_all_locked(self):
        """All locked => empty result."""
        weights = {1: 1.0, 2: 2.0}
        result = filter_unlocked_weights(weights, {1, 2})
        assert result == {}
