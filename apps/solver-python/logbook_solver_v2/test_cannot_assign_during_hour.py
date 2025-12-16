"""Test CANNOT_ASSIGN_DURING_STORE_HOUR_X rule type."""
import json
import sys
import os

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logbook_solver_v2.solver_v2 import SolverV2


def test_cannot_assign_during_store_hour_hard():
    """Test that CANNOT_ASSIGN_DURING_STORE_HOUR_X forbids assignments during that hour."""
    
    # Create a minimal payload
    payload = {
        "store": {
            "id": 1,
            "openMinutesFromMidnight": 480,  # 08:00
            "closeMinutesFromMidnight": 1020  # 17:00
        },
        "roles": [
            {
                "id": 1,
                "code": "REG",
                "taskLength": 60,
                "allowOutsideStoreHours": False,
                "consecutivePolicy": "NONE",
                "familyId": 1,
                "canSplitForGaps": False
            }
        ],
        "roleFamilies": [
            {"id": 1, "name": "Register", "minMinutes": 60, "maxMinutes": 240}
        ],
        "crew": [
            {
                "id": "1234567",
                "name": "Test Crew",
                "shiftStartMin": 480,  # 08:00
                "shiftEndMin": 960,    # 16:00
                "roleIds": [1]
            }
        ],
        "coverageWindows": [],
        "crewQuotas": [],
        "roleRules": [
            {
                "id": 1,
                "roleId": 1,
                "roleCode": "REG",
                "type": "CANNOT_ASSIGN_DURING_STORE_HOUR_X",
                "constraintType": "HARD",
                "valueInt": 540,  # Forbid during 09:00 hour (540-600 minutes)
                "crewId": None    # Applies to all crew
            }
        ],
        "settings": {}
    }
    
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=30)
    
    print(f"\nResult success: {result.get('success', 'N/A')}")
    print(f"Metadata: {result.get('metadata', {})}")
    print(f"Assignments: {len(result.get('assignments', []))}")
    
    # Check that no assignments overlap with the forbidden hour (09:00-10:00 = minutes 540-600)
    forbidden_start = 540
    forbidden_end = 600
    
    violations = []
    for assignment in result.get('assignments', []):
        start_min = assignment['startMinute']
        end_min = assignment['endMinute']
        
        # Check overlap with forbidden hour
        if start_min < forbidden_end and end_min > forbidden_start:
            violations.append({
                'slot': assignment['slotIndex'],
                'startMin': start_min,
                'endMin': end_min,
                'roleId': assignment['roleId']
            })
    
    if violations:
        print(f"\n❌ FAIL: Found {len(violations)} assignments during forbidden hour 09:00-10:00:")
        for v in violations:
            print(f"   Slot {v['slot']}: {v['startMin']//60:02d}:{v['startMin']%60:02d} - {v['endMin']//60:02d}:{v['endMin']%60:02d}")
        return False
    else:
        print(f"\n✅ PASS: No assignments during forbidden hour 09:00-10:00")
        
        # Print what WAS assigned
        print("\nAssignments made:")
        for a in sorted(result.get('assignments', []), key=lambda x: x['slotIndex']):
            start_min = a['startMinute']
            end_min = a['endMinute']
            print(f"   Slot {a['slotIndex']}: {start_min//60:02d}:{start_min%60:02d} - {end_min//60:02d}:{end_min%60:02d}")
        
        return True


def test_cannot_assign_during_store_hour_crew_specific():
    """Test that CANNOT_ASSIGN_DURING_STORE_HOUR_X can be crew-specific."""
    
    payload = {
        "store": {
            "id": 1,
            "openMinutesFromMidnight": 480,
            "closeMinutesFromMidnight": 1020
        },
        "roles": [
            {
                "id": 1,
                "code": "REG",
                "taskLength": 60,
                "allowOutsideStoreHours": False,
                "consecutivePolicy": "NONE",
                "familyId": 1,
                "canSplitForGaps": False
            }
        ],
        "roleFamilies": [
            {"id": 1, "name": "Register", "minMinutes": 60, "maxMinutes": 240}
        ],
        "crew": [
            {
                "id": "1111111",
                "name": "Crew A (Forbidden)",
                "shiftStartMin": 480,
                "shiftEndMin": 720,  # 08:00-12:00
                "roleIds": [1]
            },
            {
                "id": "2222222",
                "name": "Crew B (Allowed)",
                "shiftStartMin": 480,
                "shiftEndMin": 720,  # 08:00-12:00
                "roleIds": [1]
            }
        ],
        "coverageWindows": [],
        "crewQuotas": [],
        "roleRules": [
            {
                "id": 1,
                "roleId": 1,
                "roleCode": "REG",
                "type": "CANNOT_ASSIGN_DURING_STORE_HOUR_X",
                "constraintType": "HARD",
                "valueInt": 540,  # Forbid during 09:00 hour
                "crewId": "1111111"  # Only applies to Crew A
            }
        ],
        "settings": {}
    }
    
    solver = SolverV2(payload)
    result = solver.solve(time_limit_seconds=30)
    
    print(f"\nResult success: {result.get('success', 'N/A')}")
    
    forbidden_start = 540
    forbidden_end = 600
    
    crew_a_violations = []
    crew_b_at_09 = []
    
    for assignment in result.get('assignments', []):
        start_min = assignment['startMinute']
        end_min = assignment['endMinute']
        crew_id = assignment['crewId']
        
        if start_min < forbidden_end and end_min > forbidden_start:
            if crew_id == "1111111":
                crew_a_violations.append(assignment)
            else:
                crew_b_at_09.append(assignment)
    
    success = True
    
    if crew_a_violations:
        print(f"\n❌ FAIL: Crew A has {len(crew_a_violations)} assignments during forbidden hour")
        success = False
    else:
        print(f"\n✅ PASS: Crew A has no assignments during forbidden hour")
    
    if crew_b_at_09:
        print(f"✅ PASS: Crew B CAN be assigned during 09:00 ({len(crew_b_at_09)} assignments)")
    else:
        print(f"⚠️  INFO: Crew B has no assignments at 09:00 (may be optimal)")
    
    return success


if __name__ == "__main__":
    print("=" * 60)
    print("TEST 1: CANNOT_ASSIGN_DURING_STORE_HOUR_X - HARD constraint")
    print("=" * 60)
    test1_pass = test_cannot_assign_during_store_hour_hard()
    
    print("\n" + "=" * 60)
    print("TEST 2: CANNOT_ASSIGN_DURING_STORE_HOUR_X - Crew-specific")
    print("=" * 60)
    test2_pass = test_cannot_assign_during_store_hour_crew_specific()
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Test 1 (HARD constraint): {'✅ PASS' if test1_pass else '❌ FAIL'}")
    print(f"Test 2 (Crew-specific):   {'✅ PASS' if test2_pass else '❌ FAIL'}")
    
    if test1_pass and test2_pass:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n💥 Some tests failed!")
        sys.exit(1)
