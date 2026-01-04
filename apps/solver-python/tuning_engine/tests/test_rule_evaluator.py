"""Tests for rule_evaluator module."""

import pytest

from ..rule_evaluator import (
    RuleSatisfaction,
    evaluate_all_rules,
    evaluate_rules_to_vector,
    _find_consecutive_runs,
    _eval_forbid_role,
    _eval_max_consecutive,
    _eval_timing,
    _eval_like_hour,
    _eval_distribution,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_crew():
    """Sample crew with shifts."""
    return [
        {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960},  # 8am-4pm
        {"id": "crew-2", "shiftStartMin": 540, "shiftEndMin": 1020},  # 9am-5pm
    ]


@pytest.fixture
def sample_assignments():
    """Sample assignments for testing."""
    return [
        {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
        {"crewId": "crew-1", "roleId": 1, "startMinute": 540, "endMinute": 600},
        {"crewId": "crew-1", "roleId": 2, "startMinute": 600, "endMinute": 660},
        {"crewId": "crew-2", "roleId": 1, "startMinute": 540, "endMinute": 600},
        {"crewId": "crew-2", "roleId": 2, "startMinute": 600, "endMinute": 720},
    ]


# ---------------------------------------------------------------------------
# Helper Function Tests
# ---------------------------------------------------------------------------


class TestFindConsecutiveRuns:
    """Tests for _find_consecutive_runs helper."""

    def test_empty_assignments(self):
        assert _find_consecutive_runs([]) == []

    def test_single_assignment(self):
        assignments = [{"startMinute": 480, "endMinute": 540}]
        assert _find_consecutive_runs(assignments) == [60]

    def test_consecutive_assignments(self):
        assignments = [
            {"startMinute": 480, "endMinute": 540},
            {"startMinute": 540, "endMinute": 600},
            {"startMinute": 600, "endMinute": 660},
        ]
        assert _find_consecutive_runs(assignments) == [180]

    def test_gap_between_assignments(self):
        assignments = [
            {"startMinute": 480, "endMinute": 540},
            {"startMinute": 600, "endMinute": 660},  # Gap of 60 min
        ]
        runs = _find_consecutive_runs(assignments)
        assert runs == [60, 60]

    def test_unsorted_assignments(self):
        """Should sort and find correct runs."""
        assignments = [
            {"startMinute": 540, "endMinute": 600},
            {"startMinute": 480, "endMinute": 540},
        ]
        assert _find_consecutive_runs(assignments) == [120]


# ---------------------------------------------------------------------------
# FORBID_ROLE Tests
# ---------------------------------------------------------------------------


class TestForbidRole:
    """Tests for FORBID_ROLE evaluator."""

    def test_not_assigned_returns_satisfied(self):
        rule = {"id": 1, "type": "FORBID_ROLE", "crewId": "crew-1", "roleId": 999}
        crew_info = {"id": "crew-1"}
        assignments = [{"crewId": "crew-1", "roleId": 1}]

        result = _eval_forbid_role(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 1.0
        assert result.details["assigned"] is False

    def test_assigned_returns_violated(self):
        rule = {"id": 1, "type": "FORBID_ROLE", "crewId": "crew-1", "roleId": 1}
        crew_info = {"id": "crew-1"}
        assignments = [{"crewId": "crew-1", "roleId": 1}]

        result = _eval_forbid_role(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 0.0
        assert result.details["assigned"] is True


# ---------------------------------------------------------------------------
# MAX_CONSECUTIVE_MINUTES Tests
# ---------------------------------------------------------------------------


class TestMaxConsecutive:
    """Tests for MAX_CONSECUTIVE_MINUTES evaluator."""

    def test_full_satisfaction_when_target_reached(self):
        rule = {"id": 1, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120}
        crew_info = {"id": "crew-1"}
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
            {"crewId": "crew-1", "roleId": 1, "startMinute": 540, "endMinute": 600},
        ]

        result = _eval_max_consecutive(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 1.0  # 120 / 120
        assert result.details["longestRun"] == 120

    def test_partial_satisfaction(self):
        rule = {"id": 1, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120}
        crew_info = {"id": "crew-1"}
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
        ]

        result = _eval_max_consecutive(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 0.5  # 60 / 120
        assert result.details["longestRun"] == 60

    def test_not_assigned_returns_zero(self):
        rule = {"id": 1, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120}
        crew_info = {"id": "crew-1"}
        assignments = []

        result = _eval_max_consecutive(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 0.0
        assert result.eligible is False


class TestMaxConsecutiveVectorization:
    """Tests for 0/1 mapping behavior in evaluate_rules_to_vector for MAX_CONSECUTIVE_MINUTES."""

    def test_max_consecutive_not_satisfied_when_below_target(self):
        # MAX=120. If crew's longest run is 60, MAX should be 0.
        rules = [
            {"id": 2, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120},
        ]
        crew = [{"id": "crew-1"}]
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
        ]

        vec = evaluate_rules_to_vector(rules, assignments, crew)

        assert vec == [0]

    def test_max_consecutive_satisfied_when_reaches_target(self):
        # MAX=120. If crew's longest run is 120, MAX should be 1.
        rules = [
            {"id": 2, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120},
        ]
        crew = [{"id": "crew-1"}]
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
            {"crewId": "crew-1", "roleId": 1, "startMinute": 540, "endMinute": 600},
        ]

        vec = evaluate_rules_to_vector(rules, assignments, crew)

        assert vec == [1]


# ---------------------------------------------------------------------------
# TIMING Tests
# ---------------------------------------------------------------------------


class TestTiming:
    """Tests for TIMING evaluator - binary thirds-based satisfaction."""

    def test_early_preference_in_first_third(self):
        """Early preference satisfied when assignment in first third of shift."""
        rule = {"id": 1, "type": "TIMING", "crewId": "crew-1", "roleId": 1, "valueInt": -1}
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}  # 8am-4pm (480 min)
        # First third is 480-640 (160 min)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 500, "endMinute": 560},  # In first third
        ]

        result = _eval_timing(rule, "crew-1", crew_info, assignments, all_rules=[])

        assert result.satisfaction == 1.0
        assert result.details["satisfied"] is True
        assert "early" in result.details["assignmentPositions"]

    def test_early_preference_not_in_first_third(self):
        """Early preference NOT satisfied when assignment in last third."""
        rule = {"id": 1, "type": "TIMING", "crewId": "crew-1", "roleId": 1, "valueInt": -1}
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        # Last third is 800-960
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 850, "endMinute": 910},  # In last third
        ]

        result = _eval_timing(rule, "crew-1", crew_info, assignments, all_rules=[])

        assert result.satisfaction == 0.0
        assert result.details["satisfied"] is False

    def test_late_preference_in_last_third(self):
        """Late preference satisfied when assignment in last third."""
        rule = {"id": 1, "type": "TIMING", "crewId": "crew-1", "roleId": 1, "valueInt": 1}
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        # Last third is 800-960
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 850, "endMinute": 910},
        ]

        result = _eval_timing(rule, "crew-1", crew_info, assignments, all_rules=[])

        assert result.satisfaction == 1.0
        assert result.details["satisfied"] is True

    def test_middle_preference_in_middle_third(self):
        """Middle preference satisfied when assignment in middle third."""
        rule = {"id": 1, "type": "TIMING", "crewId": "crew-1", "roleId": 1, "valueInt": 0}
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        # Middle third is 640-800
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 720, "endMinute": 780},  # Center
        ]

        result = _eval_timing(rule, "crew-1", crew_info, assignments, all_rules=[])

        assert result.satisfaction == 1.0
        assert result.details["satisfied"] is True

    def test_respects_assign_after_constraint(self):
        """Valid range is constrained by ASSIGN_AFTER_SHIFT_MIN_X."""
        rule = {"id": 1, "type": "TIMING", "crewId": "crew-1", "roleId": 1, "valueInt": -1}  # Early
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        
        # Assignment at 600 (120 min into shift)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 600, "endMinute": 660},
        ]
        
        # ASSIGN_AFTER requires starting after 120 min, so valid range is 600-960
        # First third of 600-960 is 600-720
        # Assignment at 600 is in first third of valid range → satisfied
        all_rules = [
            {"crewId": "crew-1", "roleId": 1, "type": "ASSIGN_AFTER_SHIFT_MIN_X", "valueInt": 120},
        ]

        result = _eval_timing(rule, "crew-1", crew_info, assignments, all_rules)

        assert result.satisfaction == 1.0
        assert result.details["validRange"] == [600, 960]

    def test_respects_assign_before_constraint(self):
        """Valid range is constrained by ASSIGN_BEFORE_SHIFT_MIN_X."""
        rule = {"id": 1, "type": "TIMING", "crewId": "crew-1", "roleId": 1, "valueInt": 1}  # Late
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        
        # Assignment at 560 (80 min into shift)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 560, "endMinute": 600},
        ]
        
        # ASSIGN_BEFORE requires starting within first 120 min, so valid range is 480-600
        # Last third of 480-600 is 560-600
        # Assignment at 560 is in last third of valid range → satisfied
        all_rules = [
            {"crewId": "crew-1", "roleId": 1, "type": "ASSIGN_BEFORE_SHIFT_MIN_X", "valueInt": 120},
        ]

        result = _eval_timing(rule, "crew-1", crew_info, assignments, all_rules)

        assert result.satisfaction == 1.0
        assert result.details["validRange"] == [480, 600]


# ---------------------------------------------------------------------------
# LIKE_ROLE_FOR_HOUR_X Tests
# ---------------------------------------------------------------------------


class TestLikeHour:
    """Tests for LIKE_ROLE_FOR_HOUR_X evaluator."""

    def test_assigned_in_preferred_hour(self):
        rule = {"id": 1, "type": "LIKE_ROLE_FOR_HOUR_X", "crewId": "crew-1", "roleId": 1, "valueInt": 60}
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 540, "endMinute": 600},  # Hour 2 of shift
        ]

        result = _eval_like_hour(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 1.0
        assert result.details["assignedInHour"] is True

    def test_not_assigned_in_preferred_hour(self):
        rule = {"id": 1, "type": "LIKE_ROLE_FOR_HOUR_X", "crewId": "crew-1", "roleId": 1, "valueInt": 0}
        crew_info = {"id": "crew-1", "shiftStartMin": 480, "shiftEndMin": 960}
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 600, "endMinute": 660},  # Hour 3, not hour 1
        ]

        result = _eval_like_hour(rule, "crew-1", crew_info, assignments)

        assert result.satisfaction == 0.0
        assert result.details["assignedInHour"] is False


# ---------------------------------------------------------------------------
# DISTRIBUTION_BETWEEN_ROLE_X Tests
# ---------------------------------------------------------------------------


class TestDistribution:
    """Tests for DISTRIBUTION_BETWEEN_ROLE_X evaluator - family-level, binary zone-based."""

    def test_equal_distribution_satisfied_family_level(self):
        """Equal preference (0) satisfied when target family ratio is in equal zone (40-60%)."""
        rule = {
            "id": 1,
            "type": "DISTRIBUTION_BETWEEN_ROLE_X",
            "crewId": "crew-1",
            "roleId": 1,       # FLOOR role
            "targetRoleId": 3,  # REGISTER role
            "valueInt": 0,  # Equal
        }
        crew_info = {"id": "crew-1"}
        
        # Role to family mapping:
        # roleId 1, 2 -> familyId 1 (FLOOR family)
        # roleId 3, 4 -> familyId 2 (REGISTER family)
        # roleId 5 -> familyId 3 (BREAK - should be excluded)
        role_to_family = {1: 1, 2: 1, 3: 2, 4: 2, 5: 3}
        
        # 120 min FLOOR family (60+60), 120 min REGISTER family (60+60), 30 min BREAK (excluded)
        # Target ratio = 120 / (120+120) = 50% -> middle third -> satisfied
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},  # 60 min FLOOR
            {"crewId": "crew-1", "roleId": 2, "startMinute": 540, "endMinute": 600},  # 60 min FLOOR
            {"crewId": "crew-1", "roleId": 3, "startMinute": 600, "endMinute": 660},  # 60 min REGISTER
            {"crewId": "crew-1", "roleId": 4, "startMinute": 660, "endMinute": 720},  # 60 min REGISTER
            {"crewId": "crew-1", "roleId": 5, "startMinute": 720, "endMinute": 750},  # 30 min BREAK (excluded)
        ]

        result = _eval_distribution(rule, "crew-1", crew_info, assignments, role_to_family)

        assert result.satisfaction == 1.0
        assert result.details["mode"] == "family"
        assert result.details["primaryMinutes"] == 120
        assert result.details["targetMinutes"] == 120
        assert result.details["targetRatio"] == 0.5
        assert result.details["actualZone"] == "equal"
        assert result.details["satisfied"] is True

    def test_less_target_preference_satisfied(self):
        """Less target preference (-1) satisfied when target family ratio < 40%."""
        rule = {
            "id": 1,
            "type": "DISTRIBUTION_BETWEEN_ROLE_X",
            "crewId": "crew-1",
            "roleId": 1,
            "targetRoleId": 3,
            "valueInt": -1,  # Prefer less target
        }
        crew_info = {"id": "crew-1"}
        role_to_family = {1: 1, 3: 2}
        
        # 150 min FLOOR, 30 min REGISTER = 17% target ratio (first third)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 630},  # 150 min
            {"crewId": "crew-1", "roleId": 3, "startMinute": 630, "endMinute": 660},  # 30 min
        ]

        result = _eval_distribution(rule, "crew-1", crew_info, assignments, role_to_family)

        assert result.satisfaction == 1.0
        assert result.details["actualZone"] == "less_target"
        assert result.details["targetRatio"] < 0.4

    def test_more_target_preference_satisfied(self):
        """More target preference (1) satisfied when target family ratio > 60%."""
        rule = {
            "id": 1,
            "type": "DISTRIBUTION_BETWEEN_ROLE_X",
            "crewId": "crew-1",
            "roleId": 1,
            "targetRoleId": 3,
            "valueInt": 1,  # Prefer more target
        }
        crew_info = {"id": "crew-1"}
        role_to_family = {1: 1, 3: 2}
        
        # 30 min FLOOR, 150 min REGISTER = 83% target ratio (last third)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 510},  # 30 min
            {"crewId": "crew-1", "roleId": 3, "startMinute": 510, "endMinute": 660},  # 150 min
        ]

        result = _eval_distribution(rule, "crew-1", crew_info, assignments, role_to_family)

        assert result.satisfaction == 1.0
        assert result.details["actualZone"] == "more_target"
        assert result.details["targetRatio"] > 0.6

    def test_preference_not_satisfied(self):
        """Preference NOT satisfied when actual ratio in wrong third."""
        rule = {
            "id": 1,
            "type": "DISTRIBUTION_BETWEEN_ROLE_X",
            "crewId": "crew-1",
            "roleId": 1,
            "targetRoleId": 3,
            "valueInt": -1,  # Wants less target
        }
        crew_info = {"id": "crew-1"}
        role_to_family = {1: 1, 3: 2}
        
        # 30 min FLOOR, 150 min REGISTER = 83% target (but wanted less!)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 510},  # 30 min
            {"crewId": "crew-1", "roleId": 3, "startMinute": 510, "endMinute": 660},  # 150 min
        ]

        result = _eval_distribution(rule, "crew-1", crew_info, assignments, role_to_family)

        assert result.satisfaction == 0.0
        assert result.details["actualZone"] == "more_target"
        assert result.details["expectedZone"] == "less_target"
        assert result.details["satisfied"] is False

    def test_fallback_to_role_level_without_family_mapping(self):
        """Falls back to role-level when no family mapping available."""
        rule = {
            "id": 1,
            "type": "DISTRIBUTION_BETWEEN_ROLE_X",
            "crewId": "crew-1",
            "roleId": 1,
            "targetRoleId": 2,
            "valueInt": 0,
        }
        crew_info = {"id": "crew-1"}
        
        # 60 min each = 50% ratio (middle third)
        assignments = [
            {"crewId": "crew-1", "roleId": 1, "startMinute": 480, "endMinute": 540},
            {"crewId": "crew-1", "roleId": 2, "startMinute": 540, "endMinute": 600},
        ]

        # No role_to_family provided
        result = _eval_distribution(rule, "crew-1", crew_info, assignments, None)

        assert result.satisfaction == 1.0
        assert result.details["mode"] == "role"


# ---------------------------------------------------------------------------
# Integration Tests
# ---------------------------------------------------------------------------


class TestEvaluateAllRules:
    """Integration tests for evaluate_all_rules."""

    def test_evaluates_multiple_rules(self, sample_crew, sample_assignments):
        rules = [
            {"id": 1, "type": "FORBID_ROLE", "crewId": "crew-1", "roleId": 999},
            {"id": 2, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "crew-1", "roleId": 1, "valueInt": 120},
        ]

        results = evaluate_all_rules(rules, sample_assignments, sample_crew)

        assert len(results) == 2
        assert results[0].rule_type == "FORBID_ROLE"
        assert results[0].satisfaction == 1.0  # Not assigned to role 999
        assert results[1].rule_type == "MAX_CONSECUTIVE_MINUTES"
        assert results[1].satisfaction == 1.0  # Has 120min consecutive on role 1


class TestEvaluateRulesToVector:
    """Tests for evaluate_rules_to_vector."""

    def test_returns_binary_vector(self, sample_crew, sample_assignments):
        rules = [
            {"id": 1, "type": "FORBID_ROLE", "crewId": "crew-1", "roleId": 999},  # Satisfied (1)
            {"id": 2, "type": "FORBID_ROLE", "crewId": "crew-1", "roleId": 1},  # Violated (0)
        ]

        vector = evaluate_rules_to_vector(rules, sample_assignments, sample_crew)

        assert vector == [1, 0]


class TestRuleSatisfactionToDict:
    """Tests for RuleSatisfaction.to_dict()."""

    def test_to_dict_format(self):
        result = RuleSatisfaction(
            rule_id=1,
            crew_id="crew-1",
            rule_type="FORBID_ROLE",
            satisfaction=0.75,
            details={"test": True},
        )

        d = result.to_dict()

        assert d["ruleId"] == 1
        assert d["crewId"] == "crew-1"
        assert d["ruleType"] == "FORBID_ROLE"
        assert d["satisfaction"] == 0.75
        assert d["eligible"] is True
        assert d["met"] is True  # 0.75 >= 0.5
        assert d["details"]["test"] is True
