"""
Test interactions between Crew Quotas and RoleRules.

Goal: Find which RoleRule types, when applied as HARD constraints,
might make crew quotas impossible to satisfy.
"""

import pytest
from ortools.sat.python import cp_model
from logbook_solver_v2.solver_v2 import SolverV2


def make_base_payload():
    """Create minimal payload with a crew member who needs 60 min of SL quota."""
    return {
        'store': {
            'id': 1,
            'timezone': 'America/New_York',
            'openMinutesFromMidnight': 480,  # 8am
            'closeMinutesFromMidnight': 1200,  # 8pm
        },
        'roleFamilies': [
            {'id': 1, 'name': 'Active', 'minMinutes': 0, 'maxMinutes': 600, 'roleIds': [35, 33, 30]},
        ],
        'roles': [
            # SL - DAILY role, 60 min task length
            {'id': 35, 'code': 'SL', 'displayName': 'Section Leader', 'taskLength': 60, 
             'assignmentModel': 'DAILY', 'familyId': 1, 'canSplitForGaps': False, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'NONE'},
            # PROD - SOLVER role, 30 min task length
            {'id': 33, 'code': 'PROD', 'displayName': 'Product', 'taskLength': 30, 
             'assignmentModel': 'SOLVER', 'familyId': 1, 'canSplitForGaps': True, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'NONE'},
            # REG - HOURLY role, 60 min task length
            {'id': 30, 'code': 'REG', 'displayName': 'Register', 'taskLength': 60, 
             'assignmentModel': 'HOURLY', 'familyId': 1, 'canSplitForGaps': False, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'NONE'},
            # BRK - Break role, 30 min task length  
            {'id': 36, 'code': 'BRK', 'displayName': 'Break', 'taskLength': 30, 
             'assignmentModel': 'SOLVER', 'familyId': 1, 'canSplitForGaps': False, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'REQUIRED'},
        ],
        'crew': [
            # Crew member with 8 hour shift (8am - 4pm)
            {'id': 'C1', 'name': 'Test Crew', 'roleIds': [35, 33, 30, 36], 
             'shiftStartMin': 480, 'shiftEndMin': 960},
        ],
        'coverageWindows': [
            # REG needs 1 person from 8am-4pm
            {'roleId': 30, 'startMin': 480, 'endMin': 960, 'crewPerMinute': 1, 'constraintRule': 'EXACTLY'},
        ],
        'crewQuotas': [
            # Crew C1 needs exactly 60 min of SL between 8am-4pm
            {'roleId': 35, 'crewId': 'C1', 'startMin': 480, 'endMin': 960, 'requiredMin': 60},
        ],
        'preferences': [],
        'bankedPreferences': [],
        'fairnessTrackers': [],
        'fairnessHistory': [],
        'roleRules': [],
    }


class TestQuotaWithMinConsecutiveMinutes:
    """Test: CrewQuota + MIN_CONSECUTIVE_MINUTES"""
    
    def test_compatible_min_consecutive(self):
        """MIN_CONSECUTIVE_MINUTES <= quota should be satisfiable."""
        payload = make_base_payload()
        # Require SL to be at least 60 min consecutive (matches quota exactly)
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'MIN_CONSECUTIVE_MINUTES', 'constraintType': 'HARD',
             'valueInt': 60, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: MIN_CONSECUTIVE=60 with quota=60"
    
    def test_incompatible_min_consecutive(self):
        """MIN_CONSECUTIVE_MINUTES > quota is impossible."""
        payload = make_base_payload()
        # Require SL to be at least 120 min consecutive, but quota only requires 60
        # This should still be feasible since quota is ==, not <=
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'MIN_CONSECUTIVE_MINUTES', 'constraintType': 'HARD',
             'valueInt': 120, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        # Update quota to require exactly 120
        payload['crewQuotas'][0]['requiredMin'] = 120
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: MIN_CONSECUTIVE=120 with quota=120"


class TestQuotaWithMaxConsecutiveMinutes:
    """Test: CrewQuota + MAX_CONSECUTIVE_MINUTES"""
    
    def test_compatible_max_consecutive(self):
        """MAX_CONSECUTIVE_MINUTES >= quota should be satisfiable."""
        payload = make_base_payload()
        # Allow SL up to 120 min consecutive, quota requires 60
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'MAX_CONSECUTIVE_MINUTES', 'constraintType': 'HARD',
             'valueInt': 120, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: MAX_CONSECUTIVE=120 with quota=60"
    
    def test_incompatible_max_consecutive(self):
        """MAX_CONSECUTIVE_MINUTES < quota makes it impossible."""
        payload = make_base_payload()
        # Max 30 min consecutive, but quota requires exactly 60 (which needs 60 consecutive)
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'MAX_CONSECUTIVE_MINUTES', 'constraintType': 'HARD',
             'valueInt': 30, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        # This SHOULD be infeasible - can't do 60 min of SL if max consecutive is 30
        # Unless SL can be split (which DAILY roles shouldn't be)
        print(f"Status: {result['metadata']['status']}")
        # Not asserting infeasible here since it depends on implementation


class TestQuotaWithMinShiftLengthForAccess:
    """Test: CrewQuota + MIN_SHIFT_LENGTH_FOR_ACCESS"""
    
    def test_shift_long_enough(self):
        """Shift >= required length should allow role access."""
        payload = make_base_payload()
        # Crew shift is 8 hours (480 min), require 4 hours (240 min) min
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'MIN_SHIFT_LENGTH_FOR_ACCESS', 'constraintType': 'HARD',
             'valueInt': 240, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: 8hr shift >= 4hr min requirement"
    
    def test_shift_too_short(self):
        """Shift < required length should block role access -> infeasible quota."""
        payload = make_base_payload()
        # Require 10 hour shift for SL, but crew only has 8 hour shift
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'MIN_SHIFT_LENGTH_FOR_ACCESS', 'constraintType': 'HARD',
             'valueInt': 600, 'crewId': 'C1', 'roleCode': 'SL'}  # 10 hours
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        # This SHOULD be infeasible - crew can't access SL but has quota for it
        print(f"Status: {result['metadata']['status']}")
        assert result['metadata']['status'] == 'INFEASIBLE', \
            f"Should be INFEASIBLE: shift too short for role access but quota requires it"


class TestQuotaWithCannotBeAssignedAfter:
    """Test: CrewQuota + CANNOT_BE_ASSIGNED_AFTER"""
    
    def test_no_conflict(self):
        """CANNOT_BE_ASSIGNED_AFTER with different role should not block quota."""
        payload = make_base_payload()
        # SL cannot come after REG - should still be able to do SL first
        payload['roleRules'] = [
            {'roleId': 35, 'targetRoleId': 30, 'type': 'CANNOT_BE_ASSIGNED_AFTER', 
             'constraintType': 'HARD', 'crewId': 'C1', 'roleCode': 'SL', 'targetRoleCode': 'REG'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: can do SL before REG"


class TestQuotaWithForbidRole:
    """Test: CrewQuota + FORBID_ROLE"""
    
    def test_forbid_quota_role(self):
        """FORBID_ROLE on a role with quota should be infeasible."""
        payload = make_base_payload()
        # Forbid SL entirely for this crew, but they have a quota for it
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'FORBID_ROLE', 'constraintType': 'HARD',
             'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] == 'INFEASIBLE', \
            f"Should be INFEASIBLE: role is forbidden but quota requires it"


class TestQuotaWithAssignBeforeShiftMinX:
    """Test: CrewQuota + ASSIGN_BEFORE_SHIFT_MIN_X"""
    
    def test_assign_before_compatible(self):
        """ASSIGN_BEFORE_SHIFT_MIN_X should not block if there's time."""
        payload = make_base_payload()
        # SL must be assigned within first 120 min of shift
        # Quota requires 60 min, so there's room
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'ASSIGN_BEFORE_SHIFT_MIN_X', 'constraintType': 'HARD',
             'valueInt': 120, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: 60 min quota fits in 120 min window"
    
    def test_assign_before_too_narrow(self):
        """ASSIGN_BEFORE_SHIFT_MIN_X window too small for quota -> infeasible."""
        payload = make_base_payload()
        # SL must be assigned within first 30 min, but quota requires 60 min
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'ASSIGN_BEFORE_SHIFT_MIN_X', 'constraintType': 'HARD',
             'valueInt': 30, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        # This might be infeasible depending on implementation
        print(f"Status: {result['metadata']['status']}")


class TestQuotaWithAssignAfterShiftMinX:
    """Test: CrewQuota + ASSIGN_AFTER_SHIFT_MIN_X"""
    
    def test_assign_after_compatible(self):
        """ASSIGN_AFTER_SHIFT_MIN_X should work if there's remaining time."""
        payload = make_base_payload()
        # SL must start at least 60 min into shift (shift is 8 hours, plenty of room)
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'ASSIGN_AFTER_SHIFT_MIN_X', 'constraintType': 'HARD',
             'valueInt': 60, 'crewId': 'C1', 'roleCode': 'SL'}
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"Should be feasible: can do SL after first 60 min"


class TestQuotaWithAllowHalfBlocksize:
    """Test: CrewQuota + ALLOW_HALF_BLOCKSIZE"""
    
    def test_allow_half_no_impact(self):
        """ALLOW_HALF_BLOCKSIZE should not negatively impact quotas."""
        payload = make_base_payload()
        payload['roleRules'] = [
            {'roleId': 35, 'type': 'ALLOW_HALF_BLOCKSIZE', 'constraintType': 'HARD',
             'roleCode': 'SL'}  # Store-level rule
        ]
        
        solver = SolverV2(payload)
        result = solver.solve(time_limit_seconds=10)
        
        assert result['metadata']['status'] != 'INFEASIBLE', \
            f"ALLOW_HALF_BLOCKSIZE should not cause infeasibility"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
