"""Tests for Module 2: The Stabilizer."""

import pytest

from tuning_engine.stabilizer import (
    ConflictPair,
    RuleStatus,
    _pearson_correlation,
    classify_rules,
    damped_tune,
    damped_update,
    detect_conflicts,
    difference_matrix,
    hamming_distance,
)


class TestDifferenceMatrix:
    """Tests for difference_matrix."""

    def test_no_change(self):
        """Same vectors => all zeros."""
        result = difference_matrix([1, 0, 1], [1, 0, 1])
        assert result == [0, 0, 0]

    def test_gain(self):
        """0 -> 1 is a gain (+1)."""
        result = difference_matrix([1, 1, 1], [0, 0, 0])
        assert result == [1, 1, 1]

    def test_pain(self):
        """1 -> 0 is a pain (-1)."""
        result = difference_matrix([0, 0, 0], [1, 1, 1])
        assert result == [-1, -1, -1]

    def test_mixed(self):
        """Mix of gains, pains, and stagnant."""
        result = difference_matrix([1, 0, 1], [0, 0, 1])
        assert result == [1, 0, 0]


class TestHammingDistance:
    """Tests for hamming_distance."""

    def test_identical_vectors(self):
        """Same vectors => distance 0."""
        result = hamming_distance([1, 0, 1], [1, 0, 1])
        assert result == 0

    def test_all_different(self):
        """All bits flipped => distance = length."""
        result = hamming_distance([1, 1, 1], [0, 0, 0])
        assert result == 3

    def test_some_different(self):
        """Some bits flipped."""
        result = hamming_distance([1, 0, 1], [0, 0, 1])
        assert result == 1


class TestDampedUpdate:
    """Tests for damped_update."""

    def test_alpha_zero_no_change(self):
        """Alpha = 0 means no movement."""
        result = damped_update(1.0, 2.0, alpha=0.0)
        assert result == 1.0

    def test_alpha_one_instant(self):
        """Alpha = 1 means instant jump to target."""
        result = damped_update(1.0, 2.0, alpha=1.0)
        assert result == 2.0

    def test_alpha_half(self):
        """Alpha = 0.5 means halfway."""
        result = damped_update(1.0, 2.0, alpha=0.5)
        assert result == 1.5

    def test_default_alpha(self):
        """Default alpha = 0.2."""
        result = damped_update(1.0, 2.0)  # alpha=0.2
        assert abs(result - 1.2) < 1e-9


class TestDampedTune:
    """Tests for momentum-based damped_tune."""

    def test_unsatisfied_rule_weight_increases(self):
        """Unsatisfied rule weight should increase with momentum."""
        satisfaction = [0]
        weights = {1: 1.0}
        velocities = {1: 0.0}
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        
        new_weights, new_velocities = damped_tune(
            satisfaction, weights, velocities, rules,
            beta=0.9, learning_rate=0.3
        )
        
        # Gradient = 1.0 (unsatisfied)
        # New velocity = 0.9 * 0.0 + 0.1 * 1.0 = 0.1
        # New weight = 1.0 + 0.3 * 0.1 = 1.03
        assert new_weights[1] > weights[1]
        assert new_velocities[1] > 0

    def test_satisfied_rule_weight_slightly_decreases(self):
        """Satisfied rule weight should decay slightly."""
        satisfaction = [1]
        weights = {1: 2.0}
        velocities = {1: 0.0}
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        
        new_weights, new_velocities = damped_tune(
            satisfaction, weights, velocities, rules,
            beta=0.9, learning_rate=0.3
        )
        
        # Gradient = -0.1 (satisfied)
        # New velocity = 0.9 * 0.0 + 0.1 * (-0.1) = -0.01
        # New weight = 2.0 + 0.3 * (-0.01) = 1.997
        assert new_weights[1] < weights[1]
        assert new_velocities[1] < 0

    def test_momentum_accumulates(self):
        """Repeated unsatisfied iterations should build momentum."""
        satisfaction = [0]
        weights = {1: 1.0}
        velocities = {1: 0.5}  # Already has positive velocity
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        
        new_weights, new_velocities = damped_tune(
            satisfaction, weights, velocities, rules,
            beta=0.9, learning_rate=0.3
        )
        
        # Velocity should be higher due to momentum
        # v = 0.9 * 0.5 + 0.1 * 1.0 = 0.55
        assert abs(new_velocities[1] - 0.55) < 1e-9
        # Weight = 1.0 + 0.3 * 0.55 = 1.165
        assert abs(new_weights[1] - 1.165) < 1e-9


class TestClassifyRules:
    """Tests for classify_rules."""

    def test_stable_satisfied(self):
        """Rule always satisfied should be STABLE_SATISFIED."""
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        history = [
            [1],  # iter 0
            [1],  # iter 1
            [1],  # iter 2
        ]
        result = classify_rules(history, rules)
        assert result[1] == RuleStatus.STABLE_SATISFIED

    def test_stable_unsatisfied(self):
        """Rule always unsatisfied should be STABLE_UNSATISFIED."""
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        history = [
            [0],  # iter 0
            [0],  # iter 1
        ]
        result = classify_rules(history, rules)
        assert result[1] == RuleStatus.STABLE_UNSATISFIED

    def test_stuck_after_threshold(self):
        """Rule failing >= STUCK_THRESHOLD times should be STUCK."""
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        history = [
            [0],  # iter 0
            [0],  # iter 1
            [0],  # iter 2 (3rd consecutive failure)
        ]
        result = classify_rules(history, rules)
        assert result[1] == RuleStatus.STUCK

    def test_recently_fixed(self):
        """Rule that was 0 but is now 1 should be RECENTLY_FIXED."""
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        # Only 1 flip - not oscillating
        history = [
            [0],  # iter 0
            [0],  # iter 1
            [0],  # iter 2
            [1],  # iter 3 - fixed!
        ]
        result = classify_rules(history, rules)
        assert result[1] == RuleStatus.RECENTLY_FIXED

    def test_recently_broken(self):
        """Rule that was 1 but is now 0 should be RECENTLY_BROKEN."""
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        history = [
            [1],  # iter 0
            [1],  # iter 1
            [0],  # iter 2
        ]
        result = classify_rules(history, rules)
        assert result[1] == RuleStatus.RECENTLY_BROKEN

    def test_oscillating(self):
        """Rule flipping many times should be OSCILLATING."""
        rules = [{"id": 1, "ruleType": "PREFERS_ROLE"}]
        # 4 flips in 5 iterations - clearly oscillating, ends unsatisfied (not recently fixed)
        history = [
            [0],  # iter 0
            [1],  # iter 1 - flip
            [0],  # iter 2 - flip
            [1],  # iter 3 - flip
            [0],  # iter 4 - flip (ends unsatisfied)
        ]
        result = classify_rules(history, rules)
        # With 4 flips in 5 iterations (4 >= 5//2 = 2), should be oscillating
        assert result[1] == RuleStatus.OSCILLATING


class TestPearsonCorrelation:
    """Tests for _pearson_correlation."""

    def test_perfect_positive_correlation(self):
        """Identical vectors have correlation 1.0."""
        x = [1, 0, 1, 0, 1]
        y = [1, 0, 1, 0, 1]
        result = _pearson_correlation(x, y)
        assert abs(result - 1.0) < 1e-9

    def test_perfect_negative_correlation(self):
        """Opposite vectors have correlation -1.0."""
        x = [1, 0, 1, 0, 1]
        y = [0, 1, 0, 1, 0]
        result = _pearson_correlation(x, y)
        assert abs(result - (-1.0)) < 1e-9

    def test_no_correlation(self):
        """Unrelated vectors have correlation near 0."""
        x = [1, 1, 0, 0]
        y = [1, 0, 1, 0]
        result = _pearson_correlation(x, y)
        assert abs(result) < 0.1

    def test_constant_vector_returns_zero(self):
        """Constant vectors can't correlate - return 0."""
        x = [1, 1, 1, 1]
        y = [0, 1, 0, 1]
        result = _pearson_correlation(x, y)
        assert result == 0.0

    def test_short_vector(self):
        """Single element returns 0."""
        result = _pearson_correlation([1], [0])
        assert result == 0.0


class TestDetectConflicts:
    """Tests for detect_conflicts."""

    def test_not_enough_history(self):
        """Returns empty if fewer than min_samples iterations."""
        rules = [{"id": 1}, {"id": 2}]
        history = [[1, 0], [0, 1]]  # Only 2 iterations
        result = detect_conflicts(history, rules, min_samples=3)
        assert result == []

    def test_perfect_conflict(self):
        """Perfect anti-correlation detected as conflict."""
        rules = [
            {"id": 1, "ruleType": "TIMING", "crewId": 100},
            {"id": 2, "ruleType": "DISTRIBUTION", "crewId": 100},
        ]
        # Rule 1 and Rule 2 are perfect opposites
        history = [
            [1, 0],
            [0, 1],
            [1, 0],
            [0, 1],
        ]
        result = detect_conflicts(history, rules, threshold=-0.5)
        assert len(result) == 1
        conflict = result[0]
        assert conflict.rule_a_id == 1
        assert conflict.rule_b_id == 2
        assert abs(conflict.correlation - (-1.0)) < 1e-9

    def test_no_conflict_when_positively_correlated(self):
        """Positively correlated rules are not conflicts."""
        rules = [{"id": 1}, {"id": 2}]
        # Both rules succeed and fail together
        history = [
            [1, 1],
            [0, 0],
            [1, 1],
            [0, 0],
        ]
        result = detect_conflicts(history, rules, threshold=-0.5)
        assert result == []

    def test_weak_conflict_below_threshold(self):
        """Weak negative correlation below threshold not reported."""
        rules = [{"id": 1}, {"id": 2}]
        # Some negative correlation but not strong
        history = [
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
        ]
        # This gives correlation around -0.33
        result = detect_conflicts(history, rules, threshold=-0.5)
        assert result == []

    def test_conflict_pair_contains_rule_info(self):
        """ConflictPair contains rule type and crew info."""
        rules = [
            {"id": 10, "type": "TIMING", "crewId": 123, "roleCode": "REG", "valueInt": -1},
            {"id": 20, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": 123, "roleCode": "PROD", "valueInt": 60},
        ]
        history = [
            [1, 0],
            [0, 1],
            [1, 0],
        ]
        result = detect_conflicts(history, rules, threshold=-0.5)
        assert len(result) == 1
        conflict = result[0]
        assert conflict.rule_a_info["type"] == "TIMING"
        assert conflict.rule_a_info["crewId"] == 123
        assert conflict.rule_a_info["valueInt"] == -1
        assert conflict.rule_b_info["type"] == "MAX_CONSECUTIVE_MINUTES"
        # Test human-readable descriptions
        assert "REG TIMING (early)" in conflict.rule_a_description
        assert "PROD MAX_CONSECUTIVE_MINUTES (60min)" in conflict.rule_b_description
        # Test is_same_crew property
        assert conflict.is_same_crew is True

    def test_multiple_conflicts_sorted_by_correlation(self):
        """Multiple conflicts sorted by correlation (most negative first)."""
        rules = [{"id": 1}, {"id": 2}, {"id": 3}]
        # Rule 1 vs 2: perfect negative correlation
        # Rule 1 vs 3: moderate negative correlation
        history = [
            [1, 0, 0],
            [0, 1, 1],
            [1, 0, 0],
            [0, 1, 0],  # Rule 3 breaks pattern slightly
        ]
        result = detect_conflicts(history, rules, threshold=-0.5)
        # Should have at least the 1↔2 conflict
        assert len(result) >= 1
        # First conflict should be most negative
        if len(result) > 1:
            assert result[0].correlation <= result[1].correlation


class TestDampedTuneWithConflicts:
    """Tests for conflict-aware damped tuning."""
    
    def test_conflicting_rules_get_damped(self):
        """Rules in conflict should have reduced weight changes."""
        from tuning_engine.stabilizer import damped_tune_with_conflicts, ConflictPair
        
        # Two unsatisfied rules in conflict
        rules = [
            {"id": 1, "type": "TIMING", "crewId": "c1"},
            {"id": 2, "type": "CANNOT_BE_ASSIGNED_AFTER", "crewId": "c2"},
        ]
        satisfaction = [0, 0]  # Both unsatisfied
        weights = {1: 50.0, 2: 50.0}
        velocities = {1: 0.0, 2: 0.0}
        
        # Create a conflict where rule 2 (ordering) wins over rule 1 (timing)
        conflicts = [
            ConflictPair(
                rule_a_id=1, rule_b_id=2,
                correlation=-0.8,
                rule_a_info={"type": "TIMING", "crewId": "c1"},
                rule_b_info={"type": "CANNOT_BE_ASSIGNED_AFTER", "crewId": "c2"},
            )
        ]
        
        # Without conflicts - both should increase
        new_weights_no_conflict, _, _ = damped_tune_with_conflicts(
            satisfaction, weights, velocities, rules, []
        )
        
        # With conflicts - TIMING should increase less
        new_weights_with_conflict, _, dampings = damped_tune_with_conflicts(
            satisfaction, weights, velocities, rules, conflicts
        )
        
        # Rule 1 (TIMING, loser) should get damped
        assert dampings[1] < 1.0
        # Rule 2 (ORDERING, winner) should not be damped
        assert dampings[2] == 1.0
        
        # Rule 1's weight increase should be smaller with conflict damping
        increase_no_conflict = new_weights_no_conflict[1] - weights[1]
        increase_with_conflict = new_weights_with_conflict[1] - weights[1]
        assert increase_with_conflict < increase_no_conflict
    
    def test_no_conflicts_same_as_regular(self):
        """With no conflicts, should behave like regular damped_tune."""
        from tuning_engine.stabilizer import damped_tune, damped_tune_with_conflicts
        
        rules = [{"id": 1, "type": "TIMING"}]
        satisfaction = [0]
        weights = {1: 50.0}
        velocities = {1: 0.0}
        
        new_weights_regular, new_velocities_regular = damped_tune(
            satisfaction, weights, velocities, rules
        )
        
        new_weights_conflict, new_velocities_conflict, _ = damped_tune_with_conflicts(
            satisfaction, weights, velocities, rules, []
        )
        
        assert new_weights_regular[1] == new_weights_conflict[1]
        assert new_velocities_regular[1] == new_velocities_conflict[1]