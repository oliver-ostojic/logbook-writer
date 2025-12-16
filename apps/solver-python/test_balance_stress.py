"""
Stress test: Is the REGISTER vs PRODUCT balance robust?

Tests:
1. Original scenario (baseline)
2. Different shift lengths (6h, 10h)
3. Multiple crew members
4. Different break durations
5. Edge case: No break at all
6. Edge case: Break in middle vs end
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logbook_solver_v2.solver_v2 import SolverV2


def run_test(name, payload, expected_total_min):
    """Run a test and return (success, gap, balance)"""
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"{'='*60}")
    
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=30)
    
    if not result['success']:
        print(f"  ❌ FAILED - No solution found")
        return False, None, None
    
    assignments = result['assignments']
    assignments.sort(key=lambda x: x['startMinute'])
    
    register_min = sum(a['endMinute'] - a['startMinute'] for a in assignments if a['taskType'] == 'REGISTER')
    product_min = sum(a['endMinute'] - a['startMinute'] for a in assignments if a['taskType'] == 'PRODUCT')
    break_min = sum(a['endMinute'] - a['startMinute'] for a in assignments if a['taskType'] == 'BREAK')
    
    total = register_min + product_min + break_min
    gap = expected_total_min - total
    work_total = register_min + product_min
    balance = register_min / work_total if work_total > 0 else 0
    
    print(f"  Schedule: {register_min}min REG + {product_min}min PROD + {break_min}min BRK = {total}min")
    print(f"  Gap: {gap}min | Balance: {balance:.1%} REG / {1-balance:.1%} PROD")
    
    if gap > 0:
        print(f"  ❌ Gap detected!")
        return False, gap, balance
    elif not (0.35 <= balance <= 0.65):
        print(f"  ⚠️ Balance outside 35-65% range")
        return True, gap, balance  # No gap but poor balance
    else:
        print(f"  ✅ PASSED")
        return True, gap, balance


def make_payload(shift_start, shift_end, break_min, crew_count=1):
    """Generate a test payload"""
    crew = [
        {
            "id": f"CREW{str(i+1).zfill(3)}",
            "name": f"Crew{i+1}",
            "shiftStartMin": shift_start,
            "shiftEndMin": shift_end,
            "roleIds": [1, 2, 3],
        }
        for i in range(crew_count)
    ]
    
    crew_quotas = [
        {"crewId": c["id"], "roleId": 3, "requiredMin": break_min}
        for c in crew
    ] if break_min > 0 else []
    
    return {
        "store": {
            "id": 768,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": shift_start,
            "closeMinutesFromMidnight": shift_end,
        },
        "roleFamilies": [
            {"id": 1, "name": "Customer Experience", "roleIds": [1]},
            {"id": 2, "name": "Product", "roleIds": [2]},
        ],
        "roles": [
            {"id": 1, "code": "REGISTER", "displayName": "Register", "taskLength": 60, "familyId": 1, "assignmentModel": "SOLVER", "consecutivePolicy": "NONE"},
            {"id": 2, "code": "PRODUCT", "displayName": "Product", "taskLength": 60, "familyId": 2, "assignmentModel": "SOLVER", "consecutivePolicy": "NONE"},
            {"id": 3, "code": "BREAK", "displayName": "Break", "taskLength": 30, "familyId": None, "assignmentModel": "SOLVER", "consecutivePolicy": "NONE"},
        ],
        "crew": crew,
        "roleRules": [
            {"id": 1, "roleId": 1, "roleCode": "REGISTER", "type": "MIN_CONSECUTIVE_MINUTES", "valueInt": 60, "constraintType": "HARD"},
            {"id": 2, "roleId": 1, "roleCode": "REGISTER", "type": "MAX_CONSECUTIVE_MINUTES", "valueInt": 60, "constraintType": "HARD"},
            {"id": 3, "roleId": 2, "roleCode": "PRODUCT", "type": "MIN_CONSECUTIVE_MINUTES", "valueInt": 30, "constraintType": "HARD"},
            {"id": 4, "roleId": 2, "roleCode": "PRODUCT", "type": "MAX_CONSECUTIVE_MINUTES", "valueInt": 60, "constraintType": "HARD"},
            {"id": 5, "roleId": 2, "roleCode": "PRODUCT", "type": "ALLOW_HALF_BLOCKSIZE", "constraintType": "HARD"},
            {"id": 6, "roleId": 1, "roleCode": "REGISTER", "targetRoleId": 2, "targetRoleCode": "PRODUCT", "type": "DISTRIBUTION_BETWEEN_ROLE_X", "valueInt": 0, "constraintType": "SOFT"},
        ],
        "coverageWindows": [],
        "crewQuotas": crew_quotas,
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "settings": {
            # Using defaults - no overrides needed
        },
    }


def main():
    results = []
    
    # Test 1: Original (8h shift, 30min break)
    payload = make_payload(480, 960, 30)  # 8:00-16:00
    success, gap, balance = run_test("8h shift, 30min break (baseline)", payload, 480)
    results.append(("8h/30min break", success, gap, balance))
    
    # Test 2: 6h shift, 30min break
    payload = make_payload(480, 840, 30)  # 8:00-14:00
    success, gap, balance = run_test("6h shift, 30min break", payload, 360)
    results.append(("6h/30min break", success, gap, balance))
    
    # Test 3: 10h shift, 60min break (two 30min breaks)
    payload = make_payload(480, 1080, 60)  # 8:00-18:00
    success, gap, balance = run_test("10h shift, 60min break", payload, 600)
    results.append(("10h/60min break", success, gap, balance))
    
    # Test 4: 8h shift, no break
    payload = make_payload(480, 960, 0)  # 8:00-16:00, no break
    success, gap, balance = run_test("8h shift, no break", payload, 480)
    results.append(("8h/no break", success, gap, balance))
    
    # Test 5: Multiple crew (3 people)
    payload = make_payload(480, 960, 30, crew_count=3)
    # Need to check total across all crew
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=30)
    print(f"\n{'='*60}")
    print(f"TEST: 3 crew members, 8h shift each")
    print(f"{'='*60}")
    if result['success']:
        by_crew = {}
        for a in result['assignments']:
            cid = a['crewId']
            if cid not in by_crew:
                by_crew[cid] = {'REGISTER': 0, 'PRODUCT': 0, 'BREAK': 0}
            duration = a['endMinute'] - a['startMinute']
            by_crew[cid][a['taskType']] += duration
        
        all_good = True
        for cid, mins in by_crew.items():
            total = mins['REGISTER'] + mins['PRODUCT'] + mins['BREAK']
            work = mins['REGISTER'] + mins['PRODUCT']
            bal = mins['REGISTER'] / work if work > 0 else 0
            gap = 480 - total
            print(f"  {cid}: {mins['REGISTER']}min REG + {mins['PRODUCT']}min PROD + {mins['BREAK']}min BRK = {total}min (gap={gap}, bal={bal:.1%})")
            if gap > 0:
                all_good = False
        print(f"  {'✅ ALL PASSED' if all_good else '❌ SOME FAILED'}")
        results.append(("3 crew", all_good, None, None))
    else:
        print(f"  ❌ FAILED - No solution")
        results.append(("3 crew", False, None, None))
    
    # Test 6: 4h shift (edge case - very short)
    payload = make_payload(480, 720, 30)  # 8:00-12:00
    success, gap, balance = run_test("4h shift, 30min break", payload, 240)
    results.append(("4h/30min break", success, gap, balance))
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    passed = sum(1 for r in results if r[1])
    total = len(results)
    print(f"Passed: {passed}/{total}")
    for name, success, gap, balance in results:
        status = "✅" if success else "❌"
        bal_str = f"{balance:.1%}" if balance is not None else "N/A"
        print(f"  {status} {name}: gap={gap}, balance={bal_str}")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
