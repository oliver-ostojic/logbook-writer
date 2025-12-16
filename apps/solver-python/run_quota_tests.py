#!/usr/bin/env python3
"""
Test interactions between Crew Quotas and RoleRules.
Find which RoleRule types conflict with crew quotas.
"""

import json
import sys
from logbook_solver_v2.solver_v2 import SolverV2


def make_base_payload():
    """Create minimal payload with a crew member who needs 60 min of SL quota."""
    return {
        'store': {
            'id': 1,
            'timezone': 'America/New_York',
            'openMinutesFromMidnight': 480,
            'closeMinutesFromMidnight': 1200,
        },
        'roleFamilies': [
            {'id': 1, 'name': 'Active', 'minMinutes': 0, 'maxMinutes': 600, 'roleIds': [35, 33, 30]},
        ],
        'roles': [
            {'id': 35, 'code': 'SL', 'displayName': 'Section Leader', 'taskLength': 60, 
             'assignmentModel': 'DAILY', 'familyId': 1, 'canSplitForGaps': False, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'NONE'},
            {'id': 33, 'code': 'PROD', 'displayName': 'Product', 'taskLength': 30, 
             'assignmentModel': 'SOLVER', 'familyId': 1, 'canSplitForGaps': True, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'NONE'},
            {'id': 30, 'code': 'REG', 'displayName': 'Register', 'taskLength': 60, 
             'assignmentModel': 'HOURLY', 'familyId': 1, 'canSplitForGaps': False, 
             'allowOutsideStoreHours': False, 'consecutivePolicy': 'NONE'},
        ],
        'crew': [
            {'id': 'C1', 'name': 'Test Crew', 'roleIds': [35, 33, 30], 
             'shiftStartMin': 480, 'shiftEndMin': 960},
        ],
        'coverageWindows': [],
        'crewQuotas': [
            {'roleId': 35, 'crewId': 'C1', 'startMin': 480, 'endMin': 960, 'requiredMin': 60},
        ],
        'preferences': [],
        'bankedPreferences': [],
        'fairnessTrackers': [],
        'fairnessHistory': [],
        'roleRules': [],
    }


def test_no_rules():
    """Baseline: Just quota, no rules."""
    print("\n=== TEST: Baseline (quota only, no rules) ===")
    payload = make_base_payload()
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


def test_min_consecutive():
    """MIN_CONSECUTIVE_MINUTES on SL."""
    print("\n=== TEST: MIN_CONSECUTIVE_MINUTES (60 min) ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'MIN_CONSECUTIVE_MINUTES', 'constraintType': 'HARD',
         'valueInt': 60, 'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


def test_max_consecutive():
    """MAX_CONSECUTIVE_MINUTES on SL."""
    print("\n=== TEST: MAX_CONSECUTIVE_MINUTES (60 min) ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'MAX_CONSECUTIVE_MINUTES', 'constraintType': 'HARD',
         'valueInt': 60, 'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


def test_min_shift_length_ok():
    """MIN_SHIFT_LENGTH_FOR_ACCESS with shift long enough."""
    print("\n=== TEST: MIN_SHIFT_LENGTH_FOR_ACCESS (240 min, shift=480) ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'MIN_SHIFT_LENGTH_FOR_ACCESS', 'constraintType': 'HARD',
         'valueInt': 240, 'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


def test_min_shift_length_fail():
    """MIN_SHIFT_LENGTH_FOR_ACCESS with shift too short."""
    print("\n=== TEST: MIN_SHIFT_LENGTH_FOR_ACCESS (600 min, shift=480) - SHOULD FAIL ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'MIN_SHIFT_LENGTH_FOR_ACCESS', 'constraintType': 'HARD',
         'valueInt': 600, 'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status == 'INFEASIBLE'  # Should be infeasible


def test_allow_half_blocksize():
    """ALLOW_HALF_BLOCKSIZE."""
    print("\n=== TEST: ALLOW_HALF_BLOCKSIZE ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'ALLOW_HALF_BLOCKSIZE', 'constraintType': 'HARD',
         'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


def test_forbid_role():
    """FORBID_ROLE on a role with quota - SHOULD FAIL."""
    print("\n=== TEST: FORBID_ROLE (forbid SL with SL quota) - SHOULD FAIL ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'FORBID_ROLE', 'constraintType': 'HARD',
         'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status == 'INFEASIBLE'  # Should be infeasible


def test_assign_before():
    """ASSIGN_BEFORE_SHIFT_MIN_X."""
    print("\n=== TEST: ASSIGN_BEFORE_SHIFT_MIN_X (120 min) ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'ASSIGN_BEFORE_SHIFT_MIN_X', 'constraintType': 'HARD',
         'valueInt': 120, 'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


def test_assign_after():
    """ASSIGN_AFTER_SHIFT_MIN_X."""
    print("\n=== TEST: ASSIGN_AFTER_SHIFT_MIN_X (60 min) ===")
    payload = make_base_payload()
    payload['roleRules'] = [
        {'roleId': 35, 'type': 'ASSIGN_AFTER_SHIFT_MIN_X', 'constraintType': 'HARD',
         'valueInt': 60, 'crewId': 'C1', 'roleCode': 'SL'}
    ]
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=10)
    status = result['metadata']['status']
    print(f"Status: {status}")
    return status != 'INFEASIBLE'


if __name__ == '__main__':
    results = []
    
    tests = [
        ('Baseline (no rules)', test_no_rules),
        ('MIN_CONSECUTIVE_MINUTES', test_min_consecutive),
        ('MAX_CONSECUTIVE_MINUTES', test_max_consecutive),
        ('MIN_SHIFT_LENGTH_FOR_ACCESS (ok)', test_min_shift_length_ok),
        ('MIN_SHIFT_LENGTH_FOR_ACCESS (fail)', test_min_shift_length_fail),
        ('ALLOW_HALF_BLOCKSIZE', test_allow_half_blocksize),
        ('FORBID_ROLE', test_forbid_role),
        ('ASSIGN_BEFORE_SHIFT_MIN_X', test_assign_before),
        ('ASSIGN_AFTER_SHIFT_MIN_X', test_assign_after),
    ]
    
    print("="*60)
    print("QUOTA + ROLERULE INTERACTION TESTS")
    print("="*60)
    
    for name, test_fn in tests:
        try:
            passed = test_fn()
            results.append((name, 'PASS' if passed else 'FAIL'))
        except Exception as e:
            print(f"ERROR: {e}")
            results.append((name, f'ERROR: {e}'))
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for name, result in results:
        icon = "✅" if result == 'PASS' else "❌"
        print(f"{icon} {name}: {result}")
