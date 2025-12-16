"""Test constraintRule (MIN/MAX/EXACTLY) for coverage windows."""

import sys
sys.path.insert(0, '.')

from logbook_solver_v2.solver_v2 import SolverV2


def make_payload(constraint_rule: str, crew_per_minute: int = 1, crew_count: int = 3):
    """Generate a test payload with a coverage window using the given constraint rule."""
    crew = [
        {
            "id": f"CREW{str(i+1).zfill(3)}",
            "name": f"Crew{i+1}",
            "shiftStartMin": 480,  # 8:00
            "shiftEndMin": 720,    # 12:00 (4h shift)
            "roleIds": [1],
        }
        for i in range(crew_count)
    ]
    
    return {
        "store": {
            "id": 768,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,
            "closeMinutesFromMidnight": 720,
        },
        "roleFamilies": [
            {"id": 1, "name": "Customer Experience", "roleIds": [1]},
        ],
        "roles": [
            {"id": 1, "code": "REGISTER", "displayName": "Register", "taskLength": 60, "familyId": 1, "assignmentModel": "SOLVER", "consecutivePolicy": "NONE"},
        ],
        "crew": crew,
        "roleRules": [],
        "coverageWindows": [
            {
                "roleId": 1,
                "startMin": 480,
                "endMin": 720,
                "crewPerMinute": crew_per_minute,
                "constraintRule": constraint_rule,
            }
        ],
        "crewQuotas": [],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "settings": {},
    }


def run_test(name: str, payload: dict, expected_min: int = None, expected_max: int = None):
    """Run a test and check crew assignments per hour."""
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"{'='*60}")
    
    solver = SolverV2(payload)
    result = solver.solve()
    
    # Status is in metadata
    status = result.get('metadata', {}).get('status', 'UNKNOWN')
    
    if status not in ('OPTIMAL', 'FEASIBLE'):
        print(f"  ❌ Solver returned {status}")
        return False
    
    # Count assignments per hour
    assignments = result.get('assignments', [])
    hours = {}  # hour -> count
    
    for a in assignments:
        start_hour = a['startMinute'] // 60
        end_hour = a['endMinute'] // 60
        for h in range(start_hour, end_hour):
            hours[h] = hours.get(h, 0) + 1
    
    print(f"  Assignments per hour: {hours}")
    
    # Validate based on expected min/max
    passed = True
    for hour, count in hours.items():
        if expected_min is not None and count < expected_min:
            print(f"  ❌ Hour {hour}: {count} < {expected_min} (MIN)")
            passed = False
        if expected_max is not None and count > expected_max:
            print(f"  ❌ Hour {hour}: {count} > {expected_max} (MAX)")
            passed = False
    
    if passed:
        print(f"  ✅ PASS")
    
    return passed


def test_exactly():
    """EXACTLY 2 crew should be assigned each hour."""
    payload = make_payload("EXACTLY", crew_per_minute=2, crew_count=3)
    return run_test(
        "EXACTLY 2 crew per hour (3 crew available)",
        payload,
        expected_min=2,
        expected_max=2
    )


def test_min():
    """MIN 1 crew should allow 1 or more crew per hour."""
    payload = make_payload("MIN", crew_per_minute=1, crew_count=3)
    return run_test(
        "MIN 1 crew per hour (3 crew available)",
        payload,
        expected_min=1,
        expected_max=None  # Can be more than 1
    )


def test_max():
    """MAX 2 crew should allow 0-2 crew per hour."""
    payload = make_payload("MAX", crew_per_minute=2, crew_count=3)
    return run_test(
        "MAX 2 crew per hour (3 crew available)",
        payload,
        expected_min=None,  # Can be 0
        expected_max=2
    )


def test_exactly_infeasible():
    """EXACTLY 5 crew when only 3 available should be infeasible."""
    payload = make_payload("EXACTLY", crew_per_minute=5, crew_count=3)
    
    print(f"\n{'='*60}")
    print(f"TEST: EXACTLY 5 crew (only 3 available) - should be INFEASIBLE")
    print(f"{'='*60}")
    
    solver = SolverV2(payload)
    result = solver.solve()
    
    status = result.get('metadata', {}).get('status', 'UNKNOWN')
    
    if status == 'INFEASIBLE':
        print(f"  ✅ PASS - correctly returned INFEASIBLE")
        return True
    else:
        print(f"  ❌ FAIL - expected INFEASIBLE, got {status}")
        return False


def test_min_infeasible():
    """MIN 5 crew when only 3 available should be infeasible."""
    payload = make_payload("MIN", crew_per_minute=5, crew_count=3)
    
    print(f"\n{'='*60}")
    print(f"TEST: MIN 5 crew (only 3 available) - should be INFEASIBLE")
    print(f"{'='*60}")
    
    solver = SolverV2(payload)
    result = solver.solve()
    
    status = result.get('metadata', {}).get('status', 'UNKNOWN')
    
    if status == 'INFEASIBLE':
        print(f"  ✅ PASS - correctly returned INFEASIBLE")
        return True
    else:
        print(f"  ❌ FAIL - expected INFEASIBLE, got {status}")
        return False


def test_max_feasible():
    """MAX 5 crew when only 3 available should be feasible (allows 0-3)."""
    payload = make_payload("MAX", crew_per_minute=5, crew_count=3)
    return run_test(
        "MAX 5 crew (only 3 available) - should be FEASIBLE",
        payload,
        expected_min=None,
        expected_max=5  # But realistically max 3
    )


def main():
    results = []
    
    results.append(("EXACTLY 2", test_exactly()))
    results.append(("MIN 1", test_min()))
    results.append(("MAX 2", test_max()))
    results.append(("EXACTLY 5 (infeasible)", test_exactly_infeasible()))
    results.append(("MIN 5 (infeasible)", test_min_infeasible()))
    results.append(("MAX 5 (feasible)", test_max_feasible()))
    
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
    
    print(f"\nPassed: {passed}/{total}")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
