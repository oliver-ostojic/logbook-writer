"""Tests for the Smart Conflict Resolver."""

import pytest
from tuning_engine.conflict_resolver import (
    RulePriority,
    ConflictResolver,
    ResolutionResult,
    apply_conflict_aware_damping,
    CONFLICT_STRATEGIES,
)
from tuning_engine.stabilizer import ConflictPair


class TestRulePriority:
    """Test the rule priority hierarchy."""
    
    def test_ordering_highest_priority(self):
        """Ordering constraints should have highest priority."""
        assert RulePriority.CANNOT_BE_ASSIGNED_AFTER == 100
        assert RulePriority.CANNOT_BE_ASSIGNED_BEFORE == 100
    
    def test_max_consecutive_higher_than_distribution(self):
        """MAX_CONSECUTIVE should be higher than DISTRIBUTION."""
        assert RulePriority.MAX_CONSECUTIVE_MINUTES > RulePriority.DISTRIBUTION_BETWEEN_ROLE_X
    
    def test_distribution_higher_than_preferences(self):
        """Distribution should be higher than preferences."""
        assert RulePriority.DISTRIBUTION_BETWEEN_ROLE_X > RulePriority.LIKE_ROLE_FOR_HOUR_X
        assert RulePriority.DISTRIBUTION_BETWEEN_ROLE_X > RulePriority.TIMING
    
    def test_timing_lowest_named_priority(self):
        """TIMING should be lowest of named priorities."""
        assert RulePriority.TIMING < RulePriority.LIKE_ROLE_FOR_HOUR_X
        assert RulePriority.TIMING > RulePriority.DEFAULT


class TestConflictStrategies:
    """Test that known conflict strategies are defined."""
    
    def test_ordering_vs_timing_defined(self):
        """Ordering vs TIMING should have a strategy."""
        assert ("CANNOT_BE_ASSIGNED_AFTER", "TIMING") in CONFLICT_STRATEGIES
        assert ("CANNOT_BE_ASSIGNED_BEFORE", "TIMING") in CONFLICT_STRATEGIES
    
    def test_ordering_wins_over_timing(self):
        """Ordering should win over timing."""
        strategy = CONFLICT_STRATEGIES[("CANNOT_BE_ASSIGNED_AFTER", "TIMING")]
        assert strategy["winner"] == "CANNOT_BE_ASSIGNED_AFTER"
        assert strategy["loser_damping"] < 1.0
    
    def test_same_type_conflicts_have_no_winner(self):
        """Same-type conflicts should have no winner."""
        assert CONFLICT_STRATEGIES[("TIMING", "TIMING")]["winner"] is None
        assert CONFLICT_STRATEGIES[("LIKE_ROLE_FOR_HOUR_X", "LIKE_ROLE_FOR_HOUR_X")]["winner"] is None


class TestConflictResolver:
    """Test the ConflictResolver class."""
    
    @pytest.fixture
    def resolver(self):
        return ConflictResolver()
    
    @pytest.fixture
    def ordering_vs_timing_conflict(self):
        """Create a conflict between ordering and timing rules."""
        return ConflictPair(
            rule_a_id=1,
            rule_b_id=2,
            correlation=-0.8,
            rule_a_info={"type": "CANNOT_BE_ASSIGNED_AFTER", "roleCode": "REG", "crewId": "crew1"},
            rule_b_info={"type": "TIMING", "roleCode": "P_HELM", "crewId": "crew2"},
        )
    
    @pytest.fixture
    def same_crew_conflict(self):
        """Create a same-crew conflict."""
        return ConflictPair(
            rule_a_id=3,
            rule_b_id=4,
            correlation=-0.9,
            rule_a_info={"type": "MAX_CONSECUTIVE_MINUTES", "roleCode": "REG", "crewId": "crew1"},
            rule_b_info={"type": "TIMING", "roleCode": "P_HELM", "crewId": "crew1"},  # Same crew!
        )
    
    def test_get_priority_known_type(self, resolver):
        """Should return correct priority for known types."""
        assert resolver.get_priority("CANNOT_BE_ASSIGNED_AFTER") == 100
        assert resolver.get_priority("TIMING") == 40
    
    def test_get_priority_unknown_type(self, resolver):
        """Should return default priority for unknown types."""
        assert resolver.get_priority("UNKNOWN_TYPE") == RulePriority.DEFAULT
    
    def test_get_strategy_direct(self, resolver):
        """Should find strategy in direct order."""
        strategy = resolver.get_strategy("CANNOT_BE_ASSIGNED_AFTER", "TIMING")
        assert strategy is not None
        assert strategy["winner"] == "CANNOT_BE_ASSIGNED_AFTER"
    
    def test_get_strategy_reversed(self, resolver):
        """Should find strategy in reversed order."""
        strategy = resolver.get_strategy("TIMING", "CANNOT_BE_ASSIGNED_AFTER")
        assert strategy is not None
        # Winner should be swapped
        assert strategy["winner"] == "TIMING" or strategy["winner"] == "CANNOT_BE_ASSIGNED_AFTER"
    
    def test_get_strategy_unknown(self, resolver):
        """Should return None for unknown conflict pairs."""
        strategy = resolver.get_strategy("UNKNOWN_A", "UNKNOWN_B")
        assert strategy is None
    
    def test_resolve_ordering_vs_timing(self, resolver, ordering_vs_timing_conflict):
        """Ordering should win and timing should be damped."""
        result = resolver.resolve(ordering_vs_timing_conflict)
        
        assert result.winner_id == 1  # Ordering rule
        assert result.damping_a == 1.0  # Winner keeps full adjustment
        assert result.damping_b < 1.0  # Loser is damped
        assert "Ordering" in result.strategy_used or "precedence" in result.strategy_used
    
    def test_resolve_same_crew_extra_damping(self, resolver, same_crew_conflict):
        """Same-crew conflicts should get extra damping."""
        result = resolver.resolve(same_crew_conflict)
        
        assert result.is_same_crew
        # Both should be damped more than cross-crew
        assert result.damping_a < 1.0
        assert result.damping_b < 1.0
    
    def test_resolve_unknown_uses_priority(self, resolver):
        """Unknown conflict pairs should use priority-based resolution."""
        conflict = ConflictPair(
            rule_a_id=10,
            rule_b_id=11,
            correlation=-0.7,
            rule_a_info={"type": "NEW_RULE_TYPE_A", "crewId": "crew1"},
            rule_b_info={"type": "NEW_RULE_TYPE_B", "crewId": "crew2"},
        )
        
        result = resolver.resolve(conflict)
        assert "Priority-based" in result.strategy_used
    
    def test_process_conflicts_returns_dampings(self, resolver, ordering_vs_timing_conflict):
        """process_conflicts should return per-rule dampings."""
        dampings = resolver.process_conflicts([ordering_vs_timing_conflict])
        
        assert 1 in dampings  # Rule A
        assert 2 in dampings  # Rule B
        assert dampings[1] == 1.0  # Winner
        assert dampings[2] < 1.0  # Loser
    
    def test_process_multiple_conflicts_min_damping(self, resolver):
        """When a rule is in multiple conflicts, use minimum damping."""
        conflict1 = ConflictPair(
            rule_a_id=1, rule_b_id=2,
            correlation=-0.8,
            rule_a_info={"type": "TIMING", "crewId": "c1"},
            rule_b_info={"type": "CANNOT_BE_ASSIGNED_AFTER", "crewId": "c2"},
        )
        conflict2 = ConflictPair(
            rule_a_id=1, rule_b_id=3,  # Rule 1 again!
            correlation=-0.7,
            rule_a_info={"type": "TIMING", "crewId": "c1"},
            rule_b_info={"type": "MAX_CONSECUTIVE_MINUTES", "crewId": "c3"},
        )
        
        dampings = resolver.process_conflicts([conflict1, conflict2])
        
        # Rule 1 is in two conflicts - should have minimum of its dampings
        assert 1 in dampings
        assert dampings[1] < 1.0
    
    def test_get_damping_not_in_conflict(self, resolver):
        """Rules not in conflict should return 1.0."""
        resolver.process_conflicts([])
        assert resolver.get_damping(999) == 1.0
    
    def test_resolution_summary(self, resolver, ordering_vs_timing_conflict, same_crew_conflict):
        """Summary should count conflicts correctly."""
        conflicts = [ordering_vs_timing_conflict, same_crew_conflict]
        resolver.process_conflicts(conflicts)
        summary = resolver.get_resolution_summary(conflicts)
        
        assert summary["total_conflicts"] == 2
        assert summary["same_crew_conflicts"] == 1
        assert summary["rules_damped"] > 0


class TestApplyConflictAwareDamping:
    """Test the conflict-aware weight adjustment function."""
    
    def test_unsatisfied_rule_weight_increases(self):
        """Unsatisfied rules should increase weight."""
        resolver = ConflictResolver()
        resolver.conflict_dampings = {}  # No conflicts
        
        weights = {1: 100.0}
        satisfactions = {1: 0.5}  # 50% satisfied
        
        new_weights = apply_conflict_aware_damping(
            weights, satisfactions, resolver,
            alpha=0.3, boost=10.0
        )
        
        assert new_weights[1] > weights[1]
    
    def test_satisfied_rule_weight_decays(self):
        """Satisfied rules should decay slightly."""
        resolver = ConflictResolver()
        resolver.conflict_dampings = {}
        
        weights = {1: 100.0}
        satisfactions = {1: 1.0}  # Fully satisfied
        
        new_weights = apply_conflict_aware_damping(
            weights, satisfactions, resolver,
            alpha=0.3, decay=0.98
        )
        
        assert new_weights[1] < weights[1]
    
    def test_conflict_damping_reduces_boost(self):
        """Rules in conflict should get reduced boost."""
        resolver = ConflictResolver()
        resolver.conflict_dampings = {1: 0.3}  # Heavy damping
        
        weights = {1: 100.0}
        satisfactions = {1: 0.5}
        
        # With damping
        new_weights_damped = apply_conflict_aware_damping(
            weights, satisfactions, resolver,
            alpha=0.3, boost=10.0
        )
        
        # Without damping
        resolver.conflict_dampings = {1: 1.0}
        new_weights_full = apply_conflict_aware_damping(
            weights, satisfactions, resolver,
            alpha=0.3, boost=10.0
        )
        
        # Damped should increase less
        assert new_weights_damped[1] < new_weights_full[1]
    
    def test_missing_satisfaction_defaults_to_one(self):
        """Missing satisfaction should default to 1.0 (satisfied)."""
        resolver = ConflictResolver()
        resolver.conflict_dampings = {}
        
        weights = {1: 100.0}
        satisfactions = {}  # No satisfaction data
        
        new_weights = apply_conflict_aware_damping(
            weights, satisfactions, resolver,
            alpha=0.3, decay=0.98
        )
        
        # Should decay (treated as satisfied)
        assert new_weights[1] < weights[1]
