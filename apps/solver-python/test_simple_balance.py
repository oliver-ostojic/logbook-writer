"""
Simple test: REGISTER vs PRODUCT with distribution balance.

- REGISTER: 1hr taskLength, MIN/MAX = 60min (strict 1hr blocks)
- PRODUCT: 1hr taskLength, MIN = 30min, MAX = 60min, ALLOW_HALF_BLOCKSIZE
- BREAK: 30min
- DISTRIBUTION between REGISTER and PRODUCT (equal)
- 8hr shift with 30min break = 7.5hr work
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logbook_solver_v2.solver_v2 import SolverV2

def test_simple_balance():
    payload = {
        "store": {
            "id": 768,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,   # 8:00 AM
            "closeMinutesFromMidnight": 960,  # 4:00 PM
        },
        "roleFamilies": [
            {"id": 1, "name": "Customer Experience", "roleIds": [1]},
            {"id": 2, "name": "Product", "roleIds": [2]},
        ],
        "roles": [
            {
                "id": 1,
                "code": "REGISTER",
                "displayName": "Register",
                "taskLength": 60,
                "familyId": 1,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
            },
            {
                "id": 2,
                "code": "PRODUCT",
                "displayName": "Product",
                "taskLength": 60,
                "familyId": 2,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
            },
            {
                "id": 3,
                "code": "BREAK",
                "displayName": "Break",
                "taskLength": 30,
                "familyId": None,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
            },
        ],
        "crew": [
            {
                "id": "CREW001",
                "name": "Alice",
                "shiftStartMin": 480,
                "shiftEndMin": 960,
                "roleIds": [1, 2, 3],
            },
        ],
        "roleRules": [
            # REGISTER: strict 1hr blocks
            {"id": 1, "roleId": 1, "roleCode": "REGISTER", "type": "MIN_CONSECUTIVE_MINUTES", "valueInt": 60, "constraintType": "HARD"},
            {"id": 2, "roleId": 1, "roleCode": "REGISTER", "type": "MAX_CONSECUTIVE_MINUTES", "valueInt": 60, "constraintType": "HARD"},
            
            # PRODUCT: flexible 30-60min blocks
            {"id": 3, "roleId": 2, "roleCode": "PRODUCT", "type": "MIN_CONSECUTIVE_MINUTES", "valueInt": 30, "constraintType": "HARD"},
            {"id": 4, "roleId": 2, "roleCode": "PRODUCT", "type": "MAX_CONSECUTIVE_MINUTES", "valueInt": 60, "constraintType": "HARD"},
            {"id": 5, "roleId": 2, "roleCode": "PRODUCT", "type": "ALLOW_HALF_BLOCKSIZE", "constraintType": "HARD"},
            
            # DISTRIBUTION: equal balance
            {"id": 6, "roleId": 1, "roleCode": "REGISTER", "targetRoleId": 2, "targetRoleCode": "PRODUCT", "type": "DISTRIBUTION_BETWEEN_ROLE_X", "valueInt": 0, "constraintType": "SOFT"},
        ],
        "coverageWindows": [],
        "crewQuotas": [
            {"crewId": "CREW001", "roleId": 3, "requiredMin": 30},
        ],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "settings": {
            # Using defaults - no overrides needed
        },
    }
    
    print("=" * 60)
    print("TEST: Simple REGISTER vs PRODUCT balance")
    print("=" * 60)
    print()
    print("Setup:")
    print("  - 8h shift with 30min break = 7.5h work (450 min)")
    print("  - REGISTER: 1hr blocks only (MIN=MAX=60)")
    print("  - PRODUCT: 30-60min blocks (MIN=30, MAX=60, ALLOW_HALF)")
    print("  - DISTRIBUTION: equal balance")
    print()
    
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=30)
    
    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print()
    print(f"Status: {result['metadata']['status']}")
    print(f"Runtime: {result['metadata']['runtimeMs']}ms")
    print()
    
    if not result['success']:
        print("❌ FAILED - No solution found")
        return False
    
    assignments = result['assignments']
    assignments.sort(key=lambda x: x['startMinute'])
    
    print("Schedule for Alice:")
    print("-" * 50)
    
    register_min = 0
    product_min = 0
    break_min = 0
    
    for a in assignments:
        start_h = a['startMinute'] // 60
        start_m = a['startMinute'] % 60
        end_h = a['endMinute'] // 60
        end_m = a['endMinute'] % 60
        duration = a['endMinute'] - a['startMinute']
        
        role = a['taskType']
        print(f"  {start_h:02d}:{start_m:02d} - {end_h:02d}:{end_m:02d}  {role:15} ({duration} min)")
        
        if role == 'REGISTER':
            register_min += duration
        elif role == 'PRODUCT':
            product_min += duration
        elif role == 'BREAK':
            break_min += duration
    
    print("-" * 50)
    print()
    print("Summary:")
    print(f"  REGISTER: {register_min} min ({register_min/60:.1f}h)")
    print(f"  PRODUCT:  {product_min} min ({product_min/60:.1f}h)")
    print(f"  BREAK:    {break_min} min")
    print(f"  Total:    {register_min + product_min + break_min} min (should be 480)")
    print()
    
    # Check gaps
    total_assigned = register_min + product_min + break_min
    expected_total = 480
    gap = expected_total - total_assigned
    
    if gap > 0:
        print(f"⚠️  GAP DETECTED: {gap} minutes unassigned!")
    else:
        print("✅ No gaps - all slots filled")
    
    # Check balance
    work_total = register_min + product_min
    if work_total > 0:
        balance = register_min / work_total
        print(f"  Balance: {balance:.1%} REGISTER / {1-balance:.1%} PRODUCT")
        if 0.4 <= balance <= 0.6:
            print("  ✅ Good balance (40-60% range)")
        else:
            print("  ⚠️  Imbalanced")
    
    return gap == 0


if __name__ == "__main__":
    success = test_simple_balance()
    sys.exit(0 if success else 1)
