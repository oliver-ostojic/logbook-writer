"""Test the tuning driver with a simple scenario."""

import sys
from typing import Any, Dict

# Add paths
sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop, vectorize_satisfaction, global_score, naive_tune


def create_test_payload():
    """Create a minimal payload with some conflicting rules."""
    return {
        "store": {
            "id": 1,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,   # 8:00 AM
            "closeMinutesFromMidnight": 720,  # 12:00 PM
        },
        "roleFamilies": [
            {"id": 1, "name": "FRONT", "minMinutes": 0, "maxMinutes": 480, "roleIds": [1, 2]}
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
                "allowOutsideStoreHours": False,
                "canSplitForGaps": False,
            },
            {
                "id": 2,
                "code": "GREETER",
                "displayName": "Greeter",
                "taskLength": 60,
                "familyId": 1,
                "assignmentModel": "SOLVER",
                "consecutivePolicy": "NONE",
                "allowOutsideStoreHours": False,
                "canSplitForGaps": False,
            },
        ],
        "crew": [
            {
                "id": "CREW001",
                "name": "Alice",
                "roleIds": [1, 2],
                "shiftStartMin": 480,
                "shiftEndMin": 720,
            },
            {
                "id": "CREW002",
                "name": "Bob",
                "roleIds": [1, 2],
                "shiftStartMin": 480,
                "shiftEndMin": 720,
            },
        ],
        "coverageWindows": [
            {"roleId": 1, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},
            {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},
        ],
        "roleRules": [
            # Rule 1: Alice prefers REGISTER in the early shift (SOFT - can be optimized)
            {
                "id": 1,
                "roleId": 1,
                "roleCode": "REGISTER",
                "type": "TIMING",
                "targetRoleId": None,
                "targetRoleCode": None,
                "valueInt": 1,  # EARLY third
                "constraintType": "SOFT",
                "crewId": "CREW001",
                "isPriority": False,
            },
            # Rule 2: Bob prefers GREETER (SOFT)
            {
                "id": 2,
                "roleId": 2,
                "roleCode": "GREETER",
                "type": "TIMING",
                "targetRoleId": None,
                "targetRoleCode": None,
                "valueInt": 2,  # MIDDLE third
                "constraintType": "SOFT",
                "crewId": "CREW002",
                "isPriority": False,
            },
            # Rule 3: Alice wants fair distribution of REGISTER (SOFT)
            {
                "id": 3,
                "roleId": 1,
                "roleCode": "REGISTER",
                "type": "DISTRIBUTION_BETWEEN_ROLE_X",
                "targetRoleId": None,
                "targetRoleCode": None,
                "valueInt": None,
                "constraintType": "SOFT",
                "crewId": "CREW001",
                "isPriority": False,
            },
        ],
    }


def solver_wrapper(payload: Dict[str, Any], weights: Dict[int, float]) -> Dict[str, Any]:
    """Wrapper that calls solve() with weights."""
    return solve(payload, time_limit_seconds=5, weights=weights)


def test_vectorize():
    """Test vectorize_satisfaction."""
    print("\n" + "="*60)
    print("TEST: vectorize_satisfaction")
    print("="*60)
    
    payload = create_test_payload()
    rules = payload["roleRules"]
    
    # First solve without weights
    result = solve(payload, time_limit_seconds=5)
    assert result["success"], f"Solver failed: {result}"
    
    assignments = result["assignments"]
    crew = payload["crew"]
    
    satisfaction = vectorize_satisfaction(assignments, rules, crew)
    
    print(f"\nAssignments: {len(assignments)}")
    print(f"Rules: {len(rules)}")
    print(f"Satisfaction vector: {satisfaction}")
    print(f"Satisfied: {sum(satisfaction)}/{len(satisfaction)}")
    
    return True


def test_global_score():
    """Test global_score calculation."""
    print("\n" + "="*60)
    print("TEST: global_score")
    print("="*60)
    
    rules = [{"id": 1}, {"id": 2}, {"id": 3}]
    weights = {1: 1.0, 2: 2.0, 3: 1.0}
    
    # All satisfied
    sat_all = [1, 1, 1]
    score = global_score(sat_all, weights, rules)
    print(f"All satisfied: {score:.3f} (expected 1.0)")
    assert abs(score - 1.0) < 0.001
    
    # None satisfied
    sat_none = [0, 0, 0]
    score = global_score(sat_none, weights, rules)
    print(f"None satisfied: {score:.3f} (expected 0.0)")
    assert abs(score - 0.0) < 0.001
    
    # Only high-weight satisfied
    sat_partial = [0, 1, 0]  # rule 2 (weight 2.0) satisfied
    score = global_score(sat_partial, weights, rules)
    expected = 2.0 / 4.0  # 0.5
    print(f"High-weight satisfied: {score:.3f} (expected {expected:.3f})")
    assert abs(score - expected) < 0.001
    
    print("\n✅ global_score tests passed")
    return True


def test_naive_tune():
    """Test naive_tune weight adjustment."""
    print("\n" + "="*60)
    print("TEST: naive_tune")
    print("="*60)
    
    rules = [{"id": 1}, {"id": 2}, {"id": 3}]
    weights = {1: 1.0, 2: 1.0, 3: 1.0}
    
    # Only rule 2 satisfied
    satisfaction = [0, 1, 0]
    
    new_weights = naive_tune(satisfaction, weights, rules, step=0.5)
    
    print(f"Before: {weights}")
    print(f"Satisfaction: {satisfaction}")
    print(f"After: {new_weights}")
    
    assert new_weights[1] == 1.5, f"Rule 1 should increase: {new_weights[1]}"
    assert new_weights[2] == 1.0, f"Rule 2 should stay: {new_weights[2]}"
    assert new_weights[3] == 1.5, f"Rule 3 should increase: {new_weights[3]}"
    
    print("\n✅ naive_tune tests passed")
    return True


def test_tuning_loop():
    """Test the full tuning loop."""
    print("\n" + "="*60)
    print("TEST: run_tuning_loop")
    print("="*60)
    
    payload = create_test_payload()
    
    state = run_tuning_loop(
        payload,
        solver_wrapper,
        max_iterations=5,
        min_improvement=0.01,
    )
    
    print(f"\nFinal state:")
    print(f"  Iterations: {state['iteration'] + 1}")
    print(f"  Converged: {state['converged']}")
    print(f"  Final weights: {state['weights']}")
    print(f"  Satisfaction history: {len(state['satisfaction_history'])} snapshots")
    
    for i, sat in enumerate(state['satisfaction_history']):
        score = global_score(sat, state['weights'], payload['roleRules'])
        print(f"    Iter {i}: satisfaction={sat}, score={score:.3f}")
    
    print("\n✅ tuning_loop test completed")
    return True


if __name__ == "__main__":
    print("="*60)
    print("TUNING DRIVER TESTS")
    print("="*60)
    
    tests = [
        ("vectorize_satisfaction", test_vectorize),
        ("global_score", test_global_score),
        ("naive_tune", test_naive_tune),
        ("tuning_loop", test_tuning_loop),
    ]
    
    results = []
    for name, test_fn in tests:
        try:
            result = test_fn()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ {name} FAILED: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"  {name}: {status}")
    
    all_passed = all(r[1] for r in results)
    print(f"\nOverall: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
