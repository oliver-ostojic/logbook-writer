"""
Test: Family-level balance with alternating 1-hour blocks.

Scenario:
- 8-hour shift (8:00 AM - 4:00 PM) with 30-min break
- 7.5 hours of actual work time
- Two role families:
  - Customer Experience: REGISTER, GREETER (want ~4h total)
  - Product: ORDER_WRITER, RECEIVING (want ~3.5h total)
- MIN/MAX_CONSECUTIVE_MINUTES = 60 for all roles (1-hour blocks)
- DISTRIBUTION_BETWEEN_ROLE_X with valueInt=0 (equal balance by family)

Expected outcome:
- Alternating 1-hour blocks between Customer Experience and Product roles
- Roughly balanced: ~4h Customer Experience, ~3.5h Product
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logbook_solver_v2.solver_v2 import SolverV2

def test_balanced_alternating_schedule():
    payload = {
        "store": {
            "id": 768,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,   # 8:00 AM
            "closeMinutesFromMidnight": 960,  # 4:00 PM (8 hours)
        },
        "roleFamilies": [
            {
                "id": 1, 
                "name": "Customer Experience", 
                "roleIds": [1, 2]
            },
            {
                "id": 2, 
                "name": "Product", 
                "roleIds": [3, 4]
            },
        ],
        "roles": [
            # Customer Experience roles
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
                "code": "GREETER",
                "displayName": "Greeter",
                "taskLength": 60,
                "familyId": 1,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
            },
            # Product roles
            {
                "id": 3,
                "code": "ORDER_WRITER",
                "displayName": "Order Writer",
                "taskLength": 60,
                "familyId": 2,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
            },
            {
                "id": 4,
                "code": "RECEIVING",
                "displayName": "Receiving",
                "taskLength": 60,
                "familyId": 2,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
            },
            # Break role (no family)
            {
                "id": 5,
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
                "shiftStartMin": 480,   # 8:00 AM
                "shiftEndMin": 960,     # 4:00 PM
                "roleIds": [1, 2, 3, 4, 5],  # Can do all roles
            },
        ],
        "roleRules": [
            # MIN_CONSECUTIVE_MINUTES = 60 for Customer Experience roles
            {
                "id": 1,
                "roleId": 1,
                "roleCode": "REGISTER",
                "type": "MIN_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            {
                "id": 2,
                "roleId": 1,
                "roleCode": "REGISTER",
                "type": "MAX_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            {
                "id": 3,
                "roleId": 2,
                "roleCode": "GREETER",
                "type": "MIN_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            {
                "id": 4,
                "roleId": 2,
                "roleCode": "GREETER",
                "type": "MAX_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            # MIN_CONSECUTIVE_MINUTES = 60 for Product roles
            {
                "id": 5,
                "roleId": 3,
                "roleCode": "ORDER_WRITER",
                "type": "MIN_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            {
                "id": 6,
                "roleId": 3,
                "roleCode": "ORDER_WRITER",
                "type": "MAX_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            {
                "id": 7,
                "roleId": 4,
                "roleCode": "RECEIVING",
                "type": "MIN_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            {
                "id": 8,
                "roleId": 4,
                "roleCode": "RECEIVING",
                "type": "MAX_CONSECUTIVE_MINUTES",
                "valueInt": 60,
                "constraintType": "HARD",
            },
            # DISTRIBUTION_BETWEEN_ROLE_X - balance Customer Experience vs Product
            # Uses roleId=1 (REGISTER, familyId=1) and targetRoleId=3 (ORDER_WRITER, familyId=2)
            # to look up families and balance total time across all roles in each family
            {
                "id": 9,
                "roleId": 1,
                "roleCode": "REGISTER",
                "targetRoleId": 3,
                "targetRoleCode": "ORDER_WRITER",
                "type": "DISTRIBUTION_BETWEEN_ROLE_X",
                "valueInt": 0,  # Equal balance
                "constraintType": "SOFT",
            },
            # ALLOW_HALF_BLOCKSIZE for Product roles - so they can use 30-min blocks
            # to fill the gap left by the 30-min break
            {
                "id": 10,
                "roleId": 3,
                "roleCode": "ORDER_WRITER",
                "type": "ALLOW_HALF_BLOCKSIZE",
                "constraintType": "HARD",
            },
            {
                "id": 11,
                "roleId": 4,
                "roleCode": "RECEIVING",
                "type": "ALLOW_HALF_BLOCKSIZE",
                "constraintType": "HARD",
            },
        ],
        "coverageWindows": [],
        "crewQuotas": [
            # Require 30 min break somewhere in the shift
            {
                "crewId": "CREW001",
                "roleId": 5,
                "requiredMin": 30,
            },
        ],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "settings": {
            "distributionWeight": 50,
        },
    }
    
    print("=" * 60)
    print("TEST: Family-level balance with alternating 1-hour blocks")
    print("=" * 60)
    print()
    print("Setup:")
    print("  - 8h shift (8:00 AM - 4:00 PM) with 30min break = 7.5h work")
    print("  - Customer Experience family: REGISTER, GREETER")
    print("  - Product family: ORDER_WRITER, RECEIVING")
    print("  - MIN/MAX_CONSECUTIVE_MINUTES = 60 for all roles")
    print("  - DISTRIBUTION = equal balance between families")
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
    print(f"Objective: {result['metadata']['objectiveScore']}")
    print()
    
    if not result['success']:
        print("❌ FAILED - No solution found")
        return False
    
    # Analyze the schedule
    assignments = result['assignments']
    assignments.sort(key=lambda x: x['startMinute'])
    
    print("Schedule for Alice:")
    print("-" * 50)
    
    customer_exp_minutes = 0
    product_minutes = 0
    break_minutes = 0
    
    for a in assignments:
        start_h = a['startMinute'] // 60
        start_m = a['startMinute'] % 60
        end_h = a['endMinute'] // 60
        end_m = a['endMinute'] % 60
        duration = a['endMinute'] - a['startMinute']
        
        role = a['taskType']
        print(f"  {start_h:02d}:{start_m:02d} - {end_h:02d}:{end_m:02d}  {role:15} ({duration} min)")
        
        if role in ['REGISTER', 'GREETER']:
            customer_exp_minutes += duration
        elif role in ['ORDER_WRITER', 'RECEIVING']:
            product_minutes += duration
        elif role == 'BREAK':
            break_minutes += duration
    
    print("-" * 50)
    print()
    print("Summary:")
    print(f"  Customer Experience: {customer_exp_minutes} min ({customer_exp_minutes/60:.1f}h)")
    print(f"  Product:             {product_minutes} min ({product_minutes/60:.1f}h)")
    print(f"  Break:               {break_minutes} min ({break_minutes/60:.1f}h)")
    print(f"  Total:               {customer_exp_minutes + product_minutes + break_minutes} min")
    print()
    
    # Check for alternating pattern
    print("Checking alternating pattern...")
    last_family = None
    alternations = 0
    for a in assignments:
        role = a['taskType']
        if role == 'BREAK':
            continue
        
        if role in ['REGISTER', 'GREETER']:
            current_family = 'Customer Experience'
        else:
            current_family = 'Product'
        
        if last_family and last_family != current_family:
            alternations += 1
        last_family = current_family
    
    print(f"  Number of family switches: {alternations}")
    
    # Validation
    total_work = customer_exp_minutes + product_minutes
    balance_ratio = customer_exp_minutes / total_work if total_work > 0 else 0
    
    print()
    print("Validation:")
    print(f"  Balance ratio (CustExp/Total): {balance_ratio:.1%}")
    
    # Check if assignments are in 1-hour blocks
    all_one_hour = all(
        (a['endMinute'] - a['startMinute']) == 60 or a['taskType'] == 'BREAK'
        for a in assignments
    )
    print(f"  All work blocks are 1 hour: {'✅' if all_one_hour else '❌'}")
    
    # Expected: ~53% Customer Experience (4h/7.5h)
    is_balanced = 0.45 <= balance_ratio <= 0.60
    print(f"  Balance is reasonable (45-60%): {'✅' if is_balanced else '❌'}")
    
    has_alternating = alternations >= 3
    print(f"  Has alternating pattern (3+ switches): {'✅' if has_alternating else '❌'}")
    
    success = all_one_hour and is_balanced and has_alternating
    print()
    print(f"{'✅ TEST PASSED' if success else '❌ TEST FAILED'}")
    
    return success


if __name__ == "__main__":
    success = test_balanced_alternating_schedule()
    sys.exit(0 if success else 1)
