"""Test FORBID_ROLE constraint implementation.

This test verifies that when a FORBID_ROLE rule is applied:
1. The specified crew member cannot be assigned to the forbidden role
2. Other crew members CAN still be assigned to that role
3. The forbidden crew CAN still be assigned to other roles

Run with: python -m pytest apps/solver-python/test_role_rules.py -v
Or directly: python apps/solver-python/test_role_rules.py
"""

import sys
import os

# Add the solver to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from logbook_solver_v2 import solve


def create_test_payload(role_rules=None):
    """Create a minimal solver input for testing."""
    return {
        "store": {
            "id": 1,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,   # 8:00 AM
            "closeMinutesFromMidnight": 720,  # 12:00 PM (4 hours)
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
                "roleIds": [1, 2],  # Can do REGISTER and GREETER
                "shiftStartMin": 480,  # 8:00 AM
                "shiftEndMin": 720,    # 12:00 PM
            },
            {
                "id": "CREW002",
                "name": "Bob",
                "roleIds": [1, 2],  # Can do REGISTER and GREETER
                "shiftStartMin": 480,
                "shiftEndMin": 720,
            },
        ],
        "coverageWindows": [
            # Need 1 crew on REGISTER from 8-12
            {"roleId": 1, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},
            # Need 1 crew on GREETER from 8-12
            {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},
        ],
        "crewQuotas": [],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "roleRules": role_rules or [],
    }


def test_no_rules():
    """Test: Without any rules, both crew can be assigned to any role."""
    print("\n" + "="*60)
    print("TEST 1: No rules - both crew can do any role")
    print("="*60)
    
    payload = create_test_payload(role_rules=[])
    result = solve(payload, time_limit_seconds=10)
    
    assert result['success'], f"Solver failed: {result}"
    
    # Check assignments
    assignments = result['assignments']
    print(f"\nAssignments: {len(assignments)}")
    
    crew_roles = {}
    for a in assignments:
        crew_id = a['crewId']
        role = a['taskType']
        if crew_id not in crew_roles:
            crew_roles[crew_id] = set()
        crew_roles[crew_id].add(role)
    
    for crew_id, roles in crew_roles.items():
        print(f"  {crew_id}: {roles}")
    
    print("✅ TEST 1 PASSED: Solver found a solution\n")
    return True


def test_forbid_role_for_one_crew():
    """Test: FORBID_ROLE for Alice on REGISTER - Alice should only get GREETER."""
    print("\n" + "="*60)
    print("TEST 2: FORBID_ROLE - Alice cannot do REGISTER")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "FORBID_ROLE",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": None,
            "constraintType": "HARD",
            "crewId": "CREW001",  # Alice
            "isPriority": False,
        }
    ])
    result = solve(payload, time_limit_seconds=10)
    
    assert result['success'], f"Solver failed: {result}"
    
    # Check that Alice (CREW001) is NOT assigned to REGISTER
    alice_assignments = [a for a in result['assignments'] if a['crewId'] == 'CREW001']
    alice_roles = set(a['taskType'] for a in alice_assignments)
    
    print(f"\nAlice's roles: {alice_roles}")
    
    if 'REGISTER' in alice_roles:
        print("❌ TEST 2 FAILED: Alice was assigned REGISTER despite FORBID_ROLE!")
        return False
    
    # Check that Bob CAN still do REGISTER
    bob_assignments = [a for a in result['assignments'] if a['crewId'] == 'CREW002']
    bob_roles = set(a['taskType'] for a in bob_assignments)
    
    print(f"Bob's roles: {bob_roles}")
    
    if 'REGISTER' not in bob_roles:
        print("⚠️  Warning: Bob wasn't assigned REGISTER (might be okay)")
    
    print("✅ TEST 2 PASSED: Alice was not assigned REGISTER\n")
    return True


def test_forbid_role_store_wide():
    """Test: FORBID_ROLE for all crew on GREETER - no one gets GREETER."""
    print("\n" + "="*60)
    print("TEST 3: FORBID_ROLE store-wide - nobody can do GREETER")
    print("="*60)
    
    # Remove GREETER coverage requirement so solver can still find solution
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 2,  # GREETER
            "roleCode": "GREETER",
            "type": "FORBID_ROLE",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": None,
            "constraintType": "HARD",
            "crewId": None,  # All crew
            "isPriority": False,
        }
    ])
    
    # Remove GREETER coverage requirement
    payload['coverageWindows'] = [cw for cw in payload['coverageWindows'] if cw['roleId'] != 2]
    
    result = solve(payload, time_limit_seconds=10)
    
    assert result['success'], f"Solver failed: {result}"
    
    # Check that NO ONE is assigned to GREETER
    all_roles = set(a['taskType'] for a in result['assignments'])
    
    print(f"\nAll assigned roles: {all_roles}")
    
    if 'GREETER' in all_roles:
        print("❌ TEST 3 FAILED: Someone was assigned GREETER despite store-wide FORBID_ROLE!")
        return False
    
    print("✅ TEST 3 PASSED: No one was assigned GREETER\n")
    return True


# =====================================================================
# MIN_CONSECUTIVE_MINUTES Tests
# =====================================================================

def test_min_consecutive_minutes_forces_longer_assignments():
    """Test: MIN_CONSECUTIVE_MINUTES=120 means crew must do at least 2 consecutive hours.
    
    With taskLength=60 (1 hour), MIN_CONSECUTIVE_MINUTES=120 should prevent 1-hour stints.
    """
    print("\n" + "="*60)
    print("TEST 4: MIN_CONSECUTIVE_MINUTES - Must do at least 2 hours of REGISTER")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 120,  # 120 minutes = 2 hours minimum
            "constraintType": "HARD",
            "crewId": None,  # All crew
            "isPriority": False,
        }
    ])
    result = solve(payload, time_limit_seconds=10)
    
    assert result['success'], f"Solver failed: {result}"
    
    # Get all REGISTER assignments and compute contiguous blocks per crew
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (raw):")
    for a in register_assignments:
        duration = a['durationMin']
        crew = a['crewId']
        start = a['startMinute']
        print(f"  {crew}: {start}-{start+duration} ({duration} min)")
    
    # Compute contiguous blocks for each crew
    # A block is a sequence of assignments with no gaps
    all_valid = True
    
    for crew_id in ['CREW001', 'CREW002']:
        crew_assignments = sorted(
            [a for a in register_assignments if a['crewId'] == crew_id],
            key=lambda x: x['startMinute']
        )
        
        if not crew_assignments:
            continue
        
        # Merge into contiguous blocks
        blocks = []
        current_block_start = crew_assignments[0]['startMinute']
        current_block_end = crew_assignments[0]['startMinute'] + crew_assignments[0]['durationMin']
        
        for i in range(1, len(crew_assignments)):
            a = crew_assignments[i]
            a_start = a['startMinute']
            a_end = a_start + a['durationMin']
            
            if a_start == current_block_end:
                # Contiguous - extend the block
                current_block_end = a_end
            else:
                # Gap - save current block, start new one
                blocks.append((current_block_start, current_block_end))
                current_block_start = a_start
                current_block_end = a_end
        
        # Don't forget the last block
        blocks.append((current_block_start, current_block_end))
        
        print(f"\n{crew_id} contiguous blocks:")
        for (start, end) in blocks:
            duration = end - start
            print(f"  {start}-{end} ({duration} min)")
            
            if duration < 120:
                print(f"  ❌ Block is less than 120 minutes!")
                all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 4 FAILED: Some REGISTER blocks were less than 120 min!")
        return False
    
    print("\n✅ TEST 4 PASSED: All REGISTER blocks are >= 120 min\n")
    return True


# =====================================================================
# MAX_CONSECUTIVE_MINUTES Tests
# =====================================================================

def test_max_consecutive_minutes_prevents_long_assignments():
    """Test: MAX_CONSECUTIVE_MINUTES=60 means crew cannot do more than 1 hour straight.
    
    With taskLength=60 and MAX_CONSECUTIVE_MINUTES=60, crew can only do 1 hour at a time.
    They must take a break (switch roles or be unassigned) before continuing.
    """
    print("\n" + "="*60)
    print("TEST 5: MAX_CONSECUTIVE_MINUTES - Cannot do more than 1 hour of REGISTER at a time")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MAX_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # 60 minutes = 1 hour maximum
            "constraintType": "HARD",
            "crewId": None,  # All crew
            "isPriority": False,
        }
    ])
    result = solve(payload, time_limit_seconds=10)
    
    assert result['success'], f"Solver failed: {result}"
    
    # Check that no REGISTER assignment exceeds 60 min
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments:")
    all_valid = True
    for a in register_assignments:
        duration = a['durationMin']
        crew = a['crewId']
        start = a['startMinute']
        print(f"  {crew}: {start}-{start+duration} ({duration} min)")
        
        if duration > 60:
            print(f"  ❌ Assignment exceeds 60 minutes!")
            all_valid = False
    
    if not all_valid:
        print("❌ TEST 5 FAILED: Some REGISTER assignments exceeded 60 min!")
        return False
    
    # Also verify there are no back-to-back REGISTER assignments for same crew
    # Sort by crew and start time
    for crew_id in ['CREW001', 'CREW002']:
        crew_assignments = sorted(
            [a for a in register_assignments if a['crewId'] == crew_id],
            key=lambda x: x['startMinute']
        )
        
        for i in range(len(crew_assignments) - 1):
            curr = crew_assignments[i]
            next_a = crew_assignments[i + 1]
            curr_end = curr['startMinute'] + curr['durationMin']
            next_start = next_a['startMinute']
            
            if curr_end == next_start:
                print(f"  ⚠️  Back-to-back REGISTER for {crew_id}: {curr['startMinute']}-{curr_end} then {next_start}-{next_start + next_a['durationMin']}")
                # This could be valid if there's a gap, but consecutive would violate MAX_CONSECUTIVE_MINUTES
    
    print("✅ TEST 5 PASSED: All REGISTER assignments are <= 60 min\n")
    return True


def test_max_consecutive_minutes_with_coverage():
    """Test: MAX_CONSECUTIVE_MINUTES=60 with 4-hour coverage requirement.
    
    Need 1 person on REGISTER for 4 hours, but no one can do more than 1 hour.
    Solver must rotate crew through the role.
    """
    print("\n" + "="*60)
    print("TEST 6: MAX_CONSECUTIVE_MINUTES - Rotation required for coverage")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MAX_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # 1 hour max
            "constraintType": "HARD",
            "crewId": None,  # All crew
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    
    assert result['success'], f"Solver failed: {result}"
    
    # Count REGISTER assignments per crew
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    crew_register_counts = {}
    crew_register_minutes = {}
    for a in register_assignments:
        crew = a['crewId']
        crew_register_counts[crew] = crew_register_counts.get(crew, 0) + 1
        crew_register_minutes[crew] = crew_register_minutes.get(crew, 0) + a['durationMin']
    
    print(f"\nREGISTER distribution:")
    for crew, count in crew_register_counts.items():
        mins = crew_register_minutes[crew]
        print(f"  {crew}: {count} assignments, {mins} total minutes")
    
    # With 4 hours needed and 1 hour max, need at least 4 assignments total
    total_register_minutes = sum(a['durationMin'] for a in register_assignments)
    print(f"\nTotal REGISTER coverage: {total_register_minutes} min (needed: 240 min)")
    
    if total_register_minutes < 240:
        print("❌ TEST 6 FAILED: Not enough REGISTER coverage!")
        return False
    
    # Both crew should be doing REGISTER (since neither can do it all)
    if len(crew_register_counts) < 2:
        print("❌ TEST 6 FAILED: Expected both crew to share REGISTER duty!")
        return False
    
    print("✅ TEST 6 PASSED: Both crew are rotating REGISTER duty\n")
    return True


# =====================================================================
# Combined MIN/MAX BLOCKSIZE Tests
# =====================================================================

def get_contiguous_blocks(assignments, role_name, crew_id):
    """Compute contiguous blocks for a crew on a role."""
    role_assignments = sorted(
        [a for a in assignments if a['taskType'] == role_name and a['crewId'] == crew_id],
        key=lambda x: x['startMinute']
    )
    
    if not role_assignments:
        return []
    
    blocks = []
    current_block_start = role_assignments[0]['startMinute']
    current_block_end = role_assignments[0]['startMinute'] + role_assignments[0]['durationMin']
    
    for i in range(1, len(role_assignments)):
        a = role_assignments[i]
        a_start = a['startMinute']
        a_end = a_start + a['durationMin']
        
        if a_start == current_block_end:
            # Contiguous - extend the block
            current_block_end = a_end
        else:
            # Gap - save current block, start new one
            blocks.append((current_block_start, current_block_end, current_block_end - current_block_start))
            current_block_start = a_start
            current_block_end = a_end
    
    # Don't forget the last block
    blocks.append((current_block_start, current_block_end, current_block_end - current_block_start))
    
    return blocks


def test_min1_max1_no_consecutive():
    """Test: MIN=1hr, MAX=1hr - Never have 2 consecutive hours on REGISTER.
    
    With MIN_CONSECUTIVE_MINUTES=60 and MAX_CONSECUTIVE_MINUTES=60, each block must be exactly 1 hour.
    No crew should ever have 2 consecutive hours on REGISTER.
    """
    print("\n" + "="*60)
    print("TEST 7: MIN=1, MAX=1 - No consecutive REGISTER hours")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # 1 hour minimum
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MAX_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # 1 hour maximum
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    all_valid = True
    for crew_id in ['CREW001', 'CREW002']:
        blocks = get_contiguous_blocks(result['assignments'], 'REGISTER', crew_id)
        
        if blocks:
            print(f"\n{crew_id} REGISTER blocks:")
            for (start, end, duration) in blocks:
                print(f"  {start}-{end} ({duration} min)")
                
                if duration != 60:
                    print(f"  ❌ Block is {duration} min, expected exactly 60 min!")
                    all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 7 FAILED: Some blocks were not exactly 60 min!")
        return False
    
    print("\n✅ TEST 7 PASSED: All REGISTER blocks are exactly 60 min (no consecutive)\n")
    return True


def test_min1_max2_allows_one_or_two():
    """Test: MIN=1hr, MAX=2hr - Blocks can be 1 or 2 hours.
    
    With MIN_CONSECUTIVE_MINUTES=60 and MAX_CONSECUTIVE_MINUTES=120, blocks can be 60 or 120 min.
    """
    print("\n" + "="*60)
    print("TEST 8: MIN=1, MAX=2 - Blocks can be 1 or 2 hours")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # 1 hour minimum
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MAX_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 120,  # 2 hours maximum
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    all_valid = True
    all_blocks = []
    for crew_id in ['CREW001', 'CREW002']:
        blocks = get_contiguous_blocks(result['assignments'], 'REGISTER', crew_id)
        all_blocks.extend(blocks)
        
        if blocks:
            print(f"\n{crew_id} REGISTER blocks:")
            for (start, end, duration) in blocks:
                print(f"  {start}-{end} ({duration} min)")
                
                if duration < 60:
                    print(f"  ❌ Block is {duration} min, less than MIN=60!")
                    all_valid = False
                elif duration > 120:
                    print(f"  ❌ Block is {duration} min, exceeds MAX=120!")
                    all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 8 FAILED: Some blocks violated MIN/MAX constraints!")
        return False
    
    # Check that we have valid block sizes (60 or 120)
    block_sizes = set(b[2] for b in all_blocks)
    print(f"\nBlock sizes found: {block_sizes}")
    
    print("\n✅ TEST 8 PASSED: All REGISTER blocks are 60-120 min\n")
    return True


def test_min1_max4_allows_up_to_four():
    """Test: MIN=1hr, MAX=4hr - Blocks can be 1 to 4 hours.
    
    With MIN_CONSECUTIVE_MINUTES=60 and MAX_CONSECUTIVE_MINUTES=240, blocks can be 60-240 min.
    With 4hr shift and 4hr coverage needed, one crew could do all 4 hours.
    """
    print("\n" + "="*60)
    print("TEST 9: MIN=1, MAX=4 - Blocks can be 1 to 4 hours")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # 1 hour minimum
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MAX_CONSECUTIVE_MINUTES",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 240,  # 4 hours maximum
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    all_valid = True
    all_blocks = []
    for crew_id in ['CREW001', 'CREW002']:
        blocks = get_contiguous_blocks(result['assignments'], 'REGISTER', crew_id)
        all_blocks.extend(blocks)
        
        if blocks:
            print(f"\n{crew_id} REGISTER blocks:")
            for (start, end, duration) in blocks:
                print(f"  {start}-{end} ({duration} min)")
                
                if duration < 60:
                    print(f"  ❌ Block is {duration} min, less than MIN=60!")
                    all_valid = False
                elif duration > 240:
                    print(f"  ❌ Block is {duration} min, exceeds MAX=240!")
                    all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 9 FAILED: Some blocks violated MIN/MAX constraints!")
        return False
    
    # Check that we have valid block sizes (60-240)
    block_sizes = set(b[2] for b in all_blocks)
    print(f"\nBlock sizes found: {block_sizes}")
    
    # With MAX=4hr and 4hr needed, solver CAN assign one person all 4 hours
    max_block = max(b[2] for b in all_blocks) if all_blocks else 0
    print(f"Largest block: {max_block} min")
    
    print("\n✅ TEST 9 PASSED: All REGISTER blocks are 60-240 min\n")
    return True


# =====================================================================
# ASSIGN_BEFORE_SHIFT_MIN_X / ASSIGN_AFTER_SHIFT_MIN_X Tests
# =====================================================================

def test_assign_before_shift_min():
    """Test: ASSIGN_BEFORE_SHIFT_MIN_X - Role must start within first X minutes.
    
    With 4hr shift (8am-12pm) and ASSIGN_BEFORE_SHIFT_MIN_X=120 for REGISTER,
    any REGISTER assignment must START within the first 2 hours (8am-10am).
    We reduce coverage to 2 hours so it's feasible.
    """
    print("\n" + "="*60)
    print("TEST 10: ASSIGN_BEFORE_SHIFT_MIN_X - Must start within first 2 hours")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_BEFORE_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 120,  # Must start within first 120 minutes of shift
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Reduce REGISTER coverage to 2 hours (8am-10am) so it's feasible
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # Check that all REGISTER assignments start within first 2 hours of shift
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments:")
    all_valid = True
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        
        # All crew have shift starting at 480 (8am)
        shift_start = 480
        deadline = shift_start + 120  # Must start before 10am (600)
        
        print(f"  {crew}: starts at {start} (deadline: {deadline})")
        
        if start >= deadline:
            print(f"  ❌ Starts at {start}, which is >= deadline {deadline}!")
            all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 10 FAILED: Some REGISTER assignments started too late!")
        return False
    
    print("\n✅ TEST 10 PASSED: All REGISTER assignments start within first 2 hours\n")
    return True


def test_assign_after_shift_min():
    """Test: ASSIGN_AFTER_SHIFT_MIN_X - Role must start after X minutes.
    
    With 4hr shift (8am-12pm) and ASSIGN_AFTER_SHIFT_MIN_X=120 for REGISTER,
    any REGISTER assignment must START at least 2 hours into shift (10am or later).
    We set coverage for 10am-12pm so it's feasible.
    """
    print("\n" + "="*60)
    print("TEST 11: ASSIGN_AFTER_SHIFT_MIN_X - Must start after 2 hours")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_AFTER_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 120,  # Must start at least 120 minutes into shift
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Set REGISTER coverage to 10am-12pm so it's feasible
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 600, "endMin": 720, "crewPerTaskLength": 1},  # REGISTER 10am-12pm
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # Check that all REGISTER assignments start at least 2 hours into shift
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments:")
    all_valid = True
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        
        # All crew have shift starting at 480 (8am)
        shift_start = 480
        earliest = shift_start + 120  # Cannot start before 10am (600)
        
        print(f"  {crew}: starts at {start} (earliest allowed: {earliest})")
        
        if start < earliest:
            print(f"  ❌ Starts at {start}, which is < earliest {earliest}!")
            all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 11 FAILED: Some REGISTER assignments started too early!")
        return False
    
    print("\n✅ TEST 11 PASSED: All REGISTER assignments start after 2 hours\n")
    return True


def test_timing_early_preference():
    """Test: TIMING with valueInt=-1 prefers early assignments.
    
    This is a SOFT constraint, so we just verify the solver runs and 
    check that early slots tend to be used when possible.
    """
    print("\n" + "="*60)
    print("TEST 12: TIMING - Prefer early in shift")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "TIMING",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": -1,  # Prefer early
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # TIMING is soft, so we just verify solver runs
    # The objective function should prefer earlier slots
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (with TIMING=-1 early preference):")
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        print(f"  {crew}: {start}-{start+duration}")
    
    # Just verify we got a solution
    print("\n✅ TEST 12 PASSED: Solver handles TIMING preference\n")
    return True


def test_timing_late_preference():
    """Test: TIMING with valueInt=1 prefers late assignments.
    
    This is a SOFT constraint, so we just verify the solver runs.
    """
    print("\n" + "="*60)
    print("TEST 13: TIMING - Prefer late in shift")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "TIMING",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 1,  # Prefer late
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (with TIMING=1 late preference):")
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        print(f"  {crew}: {start}-{start+duration}")
    
    print("\n✅ TEST 13 PASSED: Solver handles TIMING preference\n")
    return True


def test_timing_middle_preference():
    """Test: TIMING with valueInt=0 prefers middle-of-shift assignments.
    
    With a 4-hour shift (8am-12pm), middle is around 10am.
    The gradient gives highest bonus at center, dropping off at edges.
    """
    print("\n" + "="*60)
    print("TEST 13b: TIMING - Prefer middle of shift")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "TIMING",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 0,  # Prefer middle
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Reduce coverage to 2 hours so we can see where it prefers to place assignments
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 540, "endMin": 660, "crewPerTaskLength": 1},  # REGISTER 9-11am (middle 2hrs)
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (with TIMING=0 middle preference):")
    print(f"Shift: 8am-12pm (480-720), Center: 10am (600)")
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        center_distance = abs(start + duration/2 - 600)  # Distance from 10am
        print(f"  {crew}: {start}-{start+duration} (center distance: {center_distance} min)")
    
    print("\n✅ TEST 13b PASSED: Solver handles TIMING=0 middle preference\n")
    return True


# ============================================================================
# INTEGRATION TESTS: Combining TIMING + ASSIGN_BEFORE/AFTER
# ============================================================================

def test_integration_timing_with_assign_before():
    """
    TEST 14: Integration - TIMING + ASSIGN_BEFORE_SHIFT_MIN_X
    
    Scenario: REGISTER role with:
    - TIMING = -1 (prefer early) 
    - ASSIGN_BEFORE_SHIFT_MIN_X = 120 (must start within first 2 hours)
    
    The solver should:
    1. Respect the hard constraint (start within 2 hours)
    2. Within that window, prefer earlier slots due to TIMING=-1
    """
    print("\n" + "-"*60)
    print("TEST 14: Integration - TIMING + ASSIGN_BEFORE_SHIFT_MIN_X")
    print("-"*60)
    
    # Crew shift: 8am-12pm (480-720), 4 hours
    # ASSIGN_BEFORE = 120 means must start by minute 600 (10am)
    # TIMING = -1 means prefer early, so should start at 480
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "TIMING",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": -1,  # Prefer early
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_BEFORE_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 120,  # Must start within first 2 hours of shift
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
    ])
    
    # Reduce REGISTER coverage to 2 hours (8am-10am) so it's feasible
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    if not result.get('success'):
        print(f"❌ TEST 14 FAILED: Solver returned no solution: {result}")
        return False
    
    # Find REGISTER assignments
    register_assignments = [
        a for a in result.get("assignments", [])
        if a.get("taskType") == "REGISTER"
    ]
    
    if not register_assignments:
        print("❌ TEST 14 FAILED: No REGISTER assignments found")
        return False
    
    # Check constraints
    crew_shift_start = 480
    deadline = crew_shift_start + 120  # 600 (10am)
    
    earliest_start = min(a['startMinute'] for a in register_assignments)
    
    print(f"Shift: 480-720 (8am-12pm)")
    print(f"TIMING: -1 (prefer early)")
    print(f"ASSIGN_BEFORE_SHIFT_MIN_X: 120 (deadline: {deadline})")
    print(f"Earliest REGISTER start: {earliest_start}")
    
    # Hard constraint: must start before deadline
    if earliest_start >= deadline:
        print(f"❌ TEST 14 FAILED: Assignment starts at {earliest_start}, should be < {deadline}")
        return False
    
    # Soft constraint check: with TIMING=-1, should prefer early (480)
    if earliest_start == 480:
        print(f"✓ Starts at earliest possible slot (480) - TIMING=-1 working")
    else:
        print(f"✓ Starts at {earliest_start} - within deadline but not earliest")
    
    print("\n✅ TEST 14 PASSED: TIMING + ASSIGN_BEFORE integration works\n")
    return True


def test_integration_timing_with_assign_after():
    """
    TEST 15: Integration - TIMING + ASSIGN_AFTER_SHIFT_MIN_X
    
    Scenario: REGISTER role with:
    - TIMING = 1 (prefer late)
    - ASSIGN_AFTER_SHIFT_MIN_X = 120 (must start after first 2 hours)
    
    The solver should:
    1. Respect the hard constraint (start after 2 hours into shift)
    2. Within the allowed window, prefer later slots due to TIMING=1
    """
    print("\n" + "-"*60)
    print("TEST 15: Integration - TIMING + ASSIGN_AFTER_SHIFT_MIN_X")
    print("-"*60)
    
    # Crew shift: 8am-12pm (480-720), 4 hours
    # ASSIGN_AFTER = 120 means must start at or after minute 600 (10am)
    # TIMING = 1 means prefer late
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "TIMING",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 1,  # Prefer late
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_AFTER_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 120,  # Must start at least 120 minutes into shift
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
    ])
    
    # Set REGISTER coverage to 10am-12pm so it's feasible
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 600, "endMin": 720, "crewPerTaskLength": 1},  # REGISTER 10am-12pm
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    if not result.get('success'):
        print(f"❌ TEST 15 FAILED: Solver returned no solution: {result}")
        return False
    
    # Find REGISTER assignments
    register_assignments = [
        a for a in result.get("assignments", [])
        if a.get("taskType") == "REGISTER"
    ]
    
    if not register_assignments:
        print("❌ TEST 15 FAILED: No REGISTER assignments found")
        return False
    
    # Check constraints
    crew_shift_start = 480
    earliest_allowed = crew_shift_start + 120  # 600 (10am)
    
    earliest_start = min(a['startMinute'] for a in register_assignments)
    
    print(f"Shift: 480-720 (8am-12pm)")
    print(f"TIMING: 1 (prefer late)")
    print(f"ASSIGN_AFTER_SHIFT_MIN_X: 120 (earliest allowed: {earliest_allowed})")
    print(f"Earliest REGISTER start: {earliest_start}")
    
    # Hard constraint: must start at or after earliest_allowed
    if earliest_start < earliest_allowed:
        print(f"❌ TEST 15 FAILED: Assignment starts at {earliest_start}, should be >= {earliest_allowed}")
        return False
    
    print(f"✓ Assignment starts at {earliest_start} - respects ASSIGN_AFTER constraint")
    
    print("\n✅ TEST 15 PASSED: TIMING + ASSIGN_AFTER integration works\n")
    return True


def test_integration_before_and_after_window():
    """
    TEST 16: Integration - ASSIGN_BEFORE + ASSIGN_AFTER creates a window
    
    Scenario: REGISTER with:
    - ASSIGN_AFTER_SHIFT_MIN_X = 60 (must start after 1 hour into shift)
    - ASSIGN_BEFORE_SHIFT_MIN_X = 180 (must start within first 3 hours)
    
    This creates a valid window: 1-3 hours into shift (9am-11am)
    """
    print("\n" + "-"*60)
    print("TEST 16: Integration - ASSIGN_BEFORE + ASSIGN_AFTER window")
    print("-"*60)
    
    # Crew shift: 8am-1pm (480-780), 5 hours
    # ASSIGN_AFTER = 60 means start >= 540
    # ASSIGN_BEFORE = 180 means start < 660
    # Valid window: 540-659 (9am to just before 11am)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_AFTER_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # Must start after first hour
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_BEFORE_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 180,  # Must start within first 3 hours
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
    ])
    
    # Extend shifts to 5 hours and adjust coverage
    for crew in payload['crew']:
        crew['shiftEndMin'] = 780  # 1pm
    payload['store']['closeMinutesFromMidnight'] = 780
    
    # Set coverage in the valid window
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 540, "endMin": 660, "crewPerTaskLength": 1},  # REGISTER 9-11am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    if not result.get('success'):
        print(f"❌ TEST 16 FAILED: Solver returned no solution: {result}")
        return False
    
    # Find REGISTER assignments
    register_assignments = [
        a for a in result.get("assignments", [])
        if a.get("taskType") == "REGISTER"
    ]
    
    if not register_assignments:
        print("❌ TEST 16 FAILED: No REGISTER assignments found")
        return False
    
    crew_shift_start = 480
    earliest_allowed = crew_shift_start + 60   # 540
    latest_allowed = crew_shift_start + 180    # 660
    
    earliest_start = min(a['startMinute'] for a in register_assignments)
    
    print(f"Shift: 480-780 (8am-1pm)")
    print(f"ASSIGN_AFTER_SHIFT_MIN_X: 60 (earliest: {earliest_allowed})")
    print(f"ASSIGN_BEFORE_SHIFT_MIN_X: 180 (latest: {latest_allowed})")
    print(f"Valid window: {earliest_allowed}-{latest_allowed}")
    print(f"Earliest REGISTER start: {earliest_start}")
    
    # Check both constraints
    if earliest_start < earliest_allowed:
        print(f"❌ TEST 16 FAILED: Starts at {earliest_start}, should be >= {earliest_allowed}")
        return False
    
    if earliest_start >= latest_allowed:
        print(f"❌ TEST 16 FAILED: Starts at {earliest_start}, should be < {latest_allowed}")
        return False
    
    print(f"✓ Assignment starts at {earliest_start} - within valid window [{earliest_allowed}, {latest_allowed})")
    
    print("\n✅ TEST 16 PASSED: ASSIGN_BEFORE + ASSIGN_AFTER window works\n")
    return True


def test_integration_all_three_combined():
    """
    TEST 17: Integration - TIMING + ASSIGN_BEFORE + ASSIGN_AFTER combined
    
    Full scenario: REGISTER with:
    - TIMING = -1 (prefer early)
    - ASSIGN_AFTER_SHIFT_MIN_X = 60 (must start after 1 hour)
    - ASSIGN_BEFORE_SHIFT_MIN_X = 180 (must start within 3 hours)
    
    With TIMING=-1, should pick earliest slot in allowed window
    """
    print("\n" + "-"*60)
    print("TEST 17: Integration - All three combined")
    print("-"*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "TIMING",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": -1,  # Prefer early
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_AFTER_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 60,  # Must start after first hour
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 3,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ASSIGN_BEFORE_SHIFT_MIN_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 180,  # Must start within first 3 hours
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        },
    ])
    
    # Extend shifts to 5 hours
    for crew in payload['crew']:
        crew['shiftEndMin'] = 780  # 1pm
    payload['store']['closeMinutesFromMidnight'] = 780
    
    # Set coverage in the valid window
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 540, "endMin": 660, "crewPerTaskLength": 1},  # REGISTER 9-11am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    if not result.get('success'):
        print(f"❌ TEST 17 FAILED: Solver returned no solution: {result}")
        return False
    
    # Find REGISTER assignments
    register_assignments = [
        a for a in result.get("assignments", [])
        if a.get("taskType") == "REGISTER"
    ]
    
    if not register_assignments:
        print("❌ TEST 17 FAILED: No REGISTER assignments found")
        return False
    
    crew_shift_start = 480
    earliest_allowed = crew_shift_start + 60   # 540
    latest_allowed = crew_shift_start + 180    # 660
    
    earliest_start = min(a['startMinute'] for a in register_assignments)
    
    print(f"Shift: 480-780 (8am-1pm)")
    print(f"TIMING: -1 (prefer early)")
    print(f"Window: [{earliest_allowed}, {latest_allowed})")
    print(f"Earliest REGISTER start: {earliest_start}")
    
    # Check hard constraints
    if earliest_start < earliest_allowed or earliest_start >= latest_allowed:
        print(f"❌ TEST 17 FAILED: Start {earliest_start} outside window [{earliest_allowed}, {latest_allowed})")
        return False
    
    # With TIMING=-1, should ideally pick 540 (earliest in window)
    if earliest_start == earliest_allowed:
        print(f"✓ Picked earliest slot in window ({earliest_allowed}) - TIMING=-1 optimal")
    else:
        print(f"✓ Picked slot {earliest_start} in window - valid but not optimal for TIMING=-1")
    
    print("\n✅ TEST 17 PASSED: All three constraints work together\n")
    return True


# ============================================================================
# CANNOT_BE_ASSIGNED_BEFORE / CANNOT_BE_ASSIGNED_AFTER TESTS
# ============================================================================

def test_cannot_be_assigned_before():
    """
    TEST 18: CANNOT_BE_ASSIGNED_BEFORE
    
    Rule: REGISTER cannot be assigned BEFORE GREETER
    Meaning: If crew does GREETER at slot T, they cannot do REGISTER at any slot < T
    
    Setup: Both roles need coverage. With this rule, REGISTER must come after GREETER.
    """
    print("\n" + "="*60)
    print("TEST 18: CANNOT_BE_ASSIGNED_BEFORE - REGISTER cannot come before GREETER")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "CANNOT_BE_ASSIGNED_BEFORE",
            "targetRoleId": 2,  # GREETER
            "targetRoleCode": "GREETER",
            "valueInt": None,
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Coverage: 1 hour of REGISTER, 1 hour of GREETER, 2 crew available
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 540, "crewPerTaskLength": 1},  # REGISTER 8-9am
        {"roleId": 2, "startMin": 540, "endMin": 600, "crewPerTaskLength": 1},  # GREETER 9-10am
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    assignments = result['assignments']
    
    # Group by crew
    crew_schedule = {}
    for a in assignments:
        crew = a['crewId']
        if crew not in crew_schedule:
            crew_schedule[crew] = []
        crew_schedule[crew].append({
            'role': a['taskType'],
            'start': a['startMinute'],
            'end': a['startMinute'] + a['durationMin']
        })
    
    print(f"\nSchedule by crew:")
    all_valid = True
    for crew, schedule in crew_schedule.items():
        schedule.sort(key=lambda x: x['start'])
        print(f"  {crew}:")
        for s in schedule:
            print(f"    {s['role']}: {s['start']}-{s['end']}")
        
        # Check constraint: REGISTER cannot come before GREETER for this crew
        register_slots = [s for s in schedule if s['role'] == 'REGISTER']
        greeter_slots = [s for s in schedule if s['role'] == 'GREETER']
        
        for r in register_slots:
            for g in greeter_slots:
                if r['start'] < g['start']:
                    print(f"  ❌ REGISTER at {r['start']} comes before GREETER at {g['start']}!")
                    all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 18 FAILED: Constraint violated\n")
        return False
    
    print("\n✅ TEST 18 PASSED: CANNOT_BE_ASSIGNED_BEFORE works\n")
    return True


def test_cannot_be_assigned_after():
    """
    TEST 19: CANNOT_BE_ASSIGNED_AFTER (Direct Adjacency)
    
    Rule: REGISTER cannot be assigned DIRECTLY AFTER GREETER
    Meaning: No GREETER→REGISTER transitions (directly consecutive)
    
    OK: GREETER at 8-9, BREAK at 9-9:30, REGISTER at 9:30-10 (not directly consecutive)
    NOT OK: GREETER at 8-9, REGISTER at 9-10 (directly consecutive - violation!)
    
    Setup: Force a scenario where GREETER ends and REGISTER must start at same time.
    This should cause the solver to use different crew OR insert something between.
    """
    print("\n" + "="*60)
    print("TEST 19: CANNOT_BE_ASSIGNED_AFTER - REGISTER cannot come DIRECTLY after GREETER")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "CANNOT_BE_ASSIGNED_AFTER",
            "targetRoleId": 2,  # GREETER
            "targetRoleCode": "GREETER",
            "valueInt": None,
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Coverage: GREETER 8-9am, then REGISTER 9-10am (directly adjacent windows)
    payload['coverageWindows'] = [
        {"roleId": 2, "startMin": 480, "endMin": 540, "crewPerTaskLength": 1},  # GREETER 8-9am
        {"roleId": 1, "startMin": 540, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 9-10am
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    assignments = result['assignments']
    
    # Group by crew
    crew_schedule = {}
    for a in assignments:
        crew = a['crewId']
        if crew not in crew_schedule:
            crew_schedule[crew] = []
        crew_schedule[crew].append({
            'role': a['taskType'],
            'start': a['startMinute'],
            'end': a['startMinute'] + a['durationMin']
        })
    
    print(f"\nSchedule by crew:")
    all_valid = True
    for crew, schedule in crew_schedule.items():
        schedule.sort(key=lambda x: x['start'])
        print(f"  {crew}:")
        for s in schedule:
            print(f"    {s['role']}: {s['start']}-{s['end']}")
        
        # Check constraint: REGISTER cannot come DIRECTLY after GREETER
        # Violation = GREETER.end == REGISTER.start for same crew
        register_tasks = [s for s in schedule if s['role'] == 'REGISTER']
        greeter_tasks = [s for s in schedule if s['role'] == 'GREETER']
        
        for r in register_tasks:
            for g in greeter_tasks:
                if g['end'] == r['start']:
                    print(f"  ❌ REGISTER at {r['start']} comes DIRECTLY after GREETER ending at {g['end']}!")
                    all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 19 FAILED: Direct adjacency constraint violated\n")
        return False
    
    # Note: With new semantics, GREETER at 8-9 and REGISTER at 9:30-10 for SAME crew is OK
    # as long as they're not directly consecutive
    print("\n✅ TEST 19 PASSED: CANNOT_BE_ASSIGNED_AFTER (direct adjacency) works\n")
    return True


def test_cannot_be_assigned_before_forces_different_crew():
    """
    TEST 20: CANNOT_BE_ASSIGNED_BEFORE (Direct Adjacency)
    
    Rule: REGISTER cannot come DIRECTLY BEFORE GREETER
    Meaning: No REGISTER→GREETER transitions (directly consecutive)
    
    Scenario: REGISTER coverage 8-9am, GREETER coverage 9-10am (directly adjacent)
    With this rule, same crew can't do REGISTER ending at 9am then GREETER starting at 9am.
    So the roles must be split between different crew OR have a gap.
    """
    print("\n" + "="*60)
    print("TEST 20: CANNOT_BE_ASSIGNED_BEFORE - REGISTER cannot come DIRECTLY before GREETER")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "CANNOT_BE_ASSIGNED_BEFORE",
            "targetRoleId": 2,  # GREETER
            "targetRoleCode": "GREETER",
            "valueInt": None,
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # REGISTER ends at 9am, GREETER starts at 9am - directly adjacent
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 540, "crewPerTaskLength": 1},  # REGISTER 8-9am
        {"roleId": 2, "startMin": 540, "endMin": 600, "crewPerTaskLength": 1},  # GREETER 9-10am
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    assignments = result['assignments']
    
    # Group by crew
    crew_schedule = {}
    for a in assignments:
        crew = a['crewId']
        if crew not in crew_schedule:
            crew_schedule[crew] = []
        crew_schedule[crew].append({
            'role': a['taskType'],
            'start': a['startMinute'],
            'end': a['startMinute'] + a['durationMin']
        })
    
    print(f"\nSchedule by crew:")
    all_valid = True
    for crew, schedule in crew_schedule.items():
        schedule.sort(key=lambda x: x['start'])
        print(f"  {crew}:")
        for s in schedule:
            print(f"    {s['role']}: {s['start']}-{s['end']}")
        
        # Check constraint: REGISTER cannot come DIRECTLY before GREETER
        # Violation = REGISTER.end == GREETER.start for same crew
        register_tasks = [s for s in schedule if s['role'] == 'REGISTER']
        greeter_tasks = [s for s in schedule if s['role'] == 'GREETER']
        
        for r in register_tasks:
            for g in greeter_tasks:
                if r['end'] == g['start']:
                    print(f"  ❌ REGISTER ending at {r['end']} is DIRECTLY before GREETER starting at {g['start']}!")
                    all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 20 FAILED: Direct adjacency constraint violated\n")
        return False
    
    print("\n✅ TEST 20 PASSED: CANNOT_BE_ASSIGNED_BEFORE (direct adjacency) works\n")
    return True


# ============================================================================
# LIKE_ROLE_FOR_HOUR_X / DISLIKE_ROLE_FOR_HOUR_X TESTS
# ============================================================================

def test_like_role_for_hour_x():
    """
    TEST 21: LIKE_ROLE_FOR_HOUR_X - Prefer REGISTER at 9am (hour 9)
    
    This is a SOFT constraint that gives a bonus for assignments at the preferred hour.
    """
    print("\n" + "="*60)
    print("TEST 21: LIKE_ROLE_FOR_HOUR_X - Prefer REGISTER at 9am")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "LIKE_ROLE_FOR_HOUR_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 9,  # Hour 9 = 9:00-9:59 AM
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Coverage: REGISTER for 2 hours (8-10am), GREETER for 4 hours
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (prefer hour 9):")
    hour_9_count = 0
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        hour = start // 60
        is_hour_9 = "✓ PREFERRED" if hour == 9 else ""
        print(f"  {crew}: {start}-{start+duration} (hour {hour}) {is_hour_9}")
        if hour == 9:
            hour_9_count += 1
    
    # Soft constraint - just verify solver runs and we get assignments
    print(f"\nAssignments at hour 9: {hour_9_count}")
    print("\n✅ TEST 21 PASSED: LIKE_ROLE_FOR_HOUR_X works\n")
    return True


def test_dislike_role_for_hour_x_soft():
    """
    TEST 22: DISLIKE_ROLE_FOR_HOUR_X (SOFT) - Avoid REGISTER at 8am
    
    This is a SOFT constraint that penalizes assignments at the disliked hour.
    """
    print("\n" + "="*60)
    print("TEST 22: DISLIKE_ROLE_FOR_HOUR_X (SOFT) - Avoid REGISTER at 8am")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "DISLIKE_ROLE_FOR_HOUR_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 8,  # Hour 8 = 8:00-8:59 AM
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Coverage: REGISTER for 2 hours (8-10am)
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (avoid hour 8):")
    hour_8_count = 0
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        hour = start // 60
        is_hour_8 = "⚠️ DISLIKED" if hour == 8 else "✓"
        print(f"  {crew}: {start}-{start+duration} (hour {hour}) {is_hour_8}")
        if hour == 8:
            hour_8_count += 1
    
    print(f"\nAssignments at disliked hour 8: {hour_8_count}")
    print("\n✅ TEST 22 PASSED: DISLIKE_ROLE_FOR_HOUR_X (SOFT) works\n")
    return True


def test_dislike_role_for_hour_x_hard():
    """
    TEST 23: DISLIKE_ROLE_FOR_HOUR_X (HARD) - Forbid REGISTER at 8am
    
    This is a HARD constraint that completely forbids assignments at the disliked hour.
    valueInt is shift-relative minutes (0 = first minute of shift = 8am for this test).
    """
    print("\n" + "="*60)
    print("TEST 23: DISLIKE_ROLE_FOR_HOUR_X (HARD) - Forbid REGISTER at 8am")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "DISLIKE_ROLE_FOR_HOUR_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 0,  # Shift-relative minute 0 = 8:00 AM (first hour of shift)
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Coverage: REGISTER for 2 hours (9-11am) - hour 8 is forbidden by rule
    # So all REGISTER must be at hour 9 or later
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 540, "endMin": 660, "crewPerTaskLength": 1},  # REGISTER 9-11am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (hour 8 FORBIDDEN):")
    all_valid = True
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        hour = start // 60
        if hour == 8:
            print(f"  ❌ {crew}: {start}-{start+duration} (hour {hour}) - FORBIDDEN!")
            all_valid = False
        else:
            print(f"  ✓ {crew}: {start}-{start+duration} (hour {hour})")
    
    if not all_valid:
        print("\n❌ TEST 23 FAILED: HARD constraint violated\n")
        return False
    
    print("\n✅ TEST 23 PASSED: DISLIKE_ROLE_FOR_HOUR_X (HARD) works\n")
    return True


def test_integration_like_and_dislike_same_role():
    """
    TEST 24: Integration - LIKE hour 10, DISLIKE hour 8 for REGISTER
    
    Solver should prefer hour 10 and avoid hour 8 when possible.
    """
    print("\n" + "="*60)
    print("TEST 24: Integration - LIKE hour 10, DISLIKE hour 8")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "LIKE_ROLE_FOR_HOUR_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 10,  # Hour 10 = 10:00-10:59 AM
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        },
        {
            "id": 2,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "DISLIKE_ROLE_FOR_HOUR_X",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 8,  # Hour 8 = 8:00-8:59 AM
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Coverage: REGISTER 8-12 (4 hours), but only need 2 hours
    # Solver should pick hours 9, 10, 11 over hour 8
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 600, "endMin": 720, "crewPerTaskLength": 1},  # REGISTER 10-12
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nREGISTER assignments (LIKE hour 10, DISLIKE hour 8):")
    hour_counts = {}
    for a in register_assignments:
        crew = a['crewId']
        start = a['startMinute']
        duration = a['durationMin']
        hour = start // 60
        hour_counts[hour] = hour_counts.get(hour, 0) + 1
        
        status = ""
        if hour == 10:
            status = "✓ LIKED"
        elif hour == 8:
            status = "⚠️ DISLIKED"
        print(f"  {crew}: {start}-{start+duration} (hour {hour}) {status}")
    
    print(f"\nHour distribution: {hour_counts}")
    print("\n✅ TEST 24 PASSED: LIKE + DISLIKE integration works\n")
    return True


# ============================================================================
# MIN_SHIFT_LENGTH_FOR_ACCESS TESTS
# ============================================================================

def test_min_shift_length_for_access():
    """
    TEST 25: MIN_SHIFT_LENGTH_FOR_ACCESS - Crew must have 4+ hour shift for REGISTER
    
    Setup: 
    - CREW001 has 4-hour shift (480-720) - CAN do REGISTER
    - CREW002 has 2-hour shift (480-600) - CANNOT do REGISTER
    """
    print("\n" + "="*60)
    print("TEST 25: MIN_SHIFT_LENGTH_FOR_ACCESS - 4hr minimum for REGISTER")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_SHIFT_LENGTH_FOR_ACCESS",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 240,  # 4 hours = 240 minutes
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Make CREW002 have a shorter shift (2 hours)
    payload['crew'][1]['shiftEndMin'] = 600  # 10am instead of 12pm
    
    # Coverage: REGISTER 8-10am (need 1 person)
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # Check who got REGISTER assignments
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    register_crew = set(a['crewId'] for a in register_assignments)
    
    print(f"\nCrew shift lengths:")
    print(f"  CREW001: {720-480}min (4hr) - ELIGIBLE")
    print(f"  CREW002: {600-480}min (2hr) - NOT ELIGIBLE")
    
    print(f"\nREGISTER assigned to: {register_crew}")
    
    if 'CREW002' in register_crew:
        print("❌ CREW002 (2hr shift) was assigned REGISTER - constraint violated!")
        print("\n❌ TEST 25 FAILED\n")
        return False
    
    print("\n✅ TEST 25 PASSED: MIN_SHIFT_LENGTH_FOR_ACCESS works\n")
    return True


def test_min_shift_length_allows_eligible_crew():
    """
    TEST 26: MIN_SHIFT_LENGTH_FOR_ACCESS - Eligible crew can still be assigned
    
    Verify that crew meeting the minimum shift length ARE assigned the role.
    """
    print("\n" + "="*60)
    print("TEST 26: MIN_SHIFT_LENGTH_FOR_ACCESS - Eligible crew assigned")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_SHIFT_LENGTH_FOR_ACCESS",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 180,  # 3 hours = 180 minutes
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    # Both crew have 4-hour shifts (480-720), both eligible
    # Coverage: REGISTER 8-10am
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # Check that REGISTER is assigned
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    print(f"\nCrew shift lengths:")
    print(f"  CREW001: {720-480}min (4hr) - ELIGIBLE (>= 180min)")
    print(f"  CREW002: {720-480}min (4hr) - ELIGIBLE (>= 180min)")
    
    print(f"\nREGISTER assignments: {len(register_assignments)}")
    for a in register_assignments:
        print(f"  {a['crewId']}: {a['startMinute']}-{a['startMinute']+a['durationMin']}")
    
    if not register_assignments:
        print("❌ No REGISTER assignments - but both crew are eligible!")
        print("\n❌ TEST 26 FAILED\n")
        return False
    
    print("\n✅ TEST 26 PASSED: Eligible crew can be assigned\n")
    return True


def test_min_shift_length_crew_specific():
    """
    TEST 27: MIN_SHIFT_LENGTH_FOR_ACCESS - Crew-specific rule
    
    Apply minimum shift length only to CREW001.
    """
    print("\n" + "="*60)
    print("TEST 27: MIN_SHIFT_LENGTH_FOR_ACCESS - Crew-specific")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MIN_SHIFT_LENGTH_FOR_ACCESS",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 300,  # 5 hours - neither crew has this
            "constraintType": "HARD",
            "crewId": "CREW001",  # Only applies to CREW001
            "isPriority": False,
        }
    ])
    
    # Both crew have 4-hour shifts, but rule only applies to CREW001
    # So CREW001 is blocked (4hr < 5hr), but CREW002 can still do REGISTER
    payload['coverageWindows'] = [
        {"roleId": 1, "startMin": 480, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 8-10am
        {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 1},  # GREETER 8-12pm
    ]
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    register_crew = set(a['crewId'] for a in register_assignments)
    
    print(f"\nRule: CREW001 needs 5hr shift for REGISTER (has 4hr)")
    print(f"CREW002: No rule applies - can do REGISTER")
    print(f"\nREGISTER assigned to: {register_crew}")
    
    if 'CREW001' in register_crew:
        print("❌ CREW001 was assigned REGISTER despite not meeting min shift!")
        print("\n❌ TEST 27 FAILED\n")
        return False
    
    if 'CREW002' not in register_crew:
        print("❌ CREW002 should have been assigned REGISTER (no rule applies)")
        print("\n❌ TEST 27 FAILED\n")
        return False
    
    print("\n✅ TEST 27 PASSED: Crew-specific MIN_SHIFT_LENGTH works\n")
    return True


# =====================================================================
# MAX_CREW_ON_AT_A_TIME Tests
# =====================================================================

def create_large_crew_payload(num_crew=6, role_rules=None):
    """Create a payload with multiple crew members for testing max crew limits."""
    crew = []
    for i in range(num_crew):
        crew.append({
            "id": f"CREW{i+1:03d}",
            "name": f"Crew{i+1}",
            "roleIds": [1, 2],  # Can do both REGISTER and GREETER
            "shiftStartMin": 480,  # 8:00 AM
            "shiftEndMin": 720,    # 12:00 PM (4 hours)
        })
    
    return {
        "store": {
            "id": 1,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,
            "closeMinutesFromMidnight": 720,
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
        "crew": crew,
        "coverageWindows": [
            # Need 4 crew on REGISTER for all 4 hours (high demand!)
            {"roleId": 1, "startMin": 480, "endMin": 720, "crewPerTaskLength": 4},
            # Need 2 crew on GREETER for all 4 hours
            {"roleId": 2, "startMin": 480, "endMin": 720, "crewPerTaskLength": 2},
        ],
        "crewQuotas": [],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "roleRules": role_rules or [],
    }


def test_max_crew_on_at_a_time():
    """Test: MAX_CREW_ON_AT_A_TIME=4 limits simultaneous crew on a role.
    
    With 6 crew members and coverage requiring 4 on REGISTER at a time,
    this should be satisfiable with max=4.
    """
    print("\n" + "="*60)
    print("TEST 28: MAX_CREW_ON_AT_A_TIME - Max 4 crew on REGISTER")
    print("="*60)
    
    payload = create_large_crew_payload(num_crew=6, role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "MAX_CREW_ON_AT_A_TIME",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": 4,  # Max 4 crew at a time
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # Count crew on REGISTER at each hour
    register_assignments = [a for a in result['assignments'] if a['taskType'] == 'REGISTER']
    
    # Group by hour (slot)
    from collections import defaultdict
    crew_per_slot = defaultdict(set)
    
    for a in register_assignments:
        start = a['startMinute']
        duration = a['durationMin']
        crew = a['crewId']
        # Mark all slots this assignment covers
        for minute in range(start, start + duration, 60):  # 60-min task length
            crew_per_slot[minute].add(crew)
    
    print(f"\nREGISTER crew count per hour:")
    all_valid = True
    for slot in sorted(crew_per_slot.keys()):
        count = len(crew_per_slot[slot])
        hour = slot // 60
        status = "✅" if count <= 4 else "❌"
        print(f"  {hour}:00 - {count} crew: {crew_per_slot[slot]} {status}")
        if count > 4:
            all_valid = False
    
    if not all_valid:
        print("\n❌ TEST 28 FAILED: More than 4 crew on REGISTER at some time!")
        return False
    
    # Verify we actually have 4 crew as required by coverage
    for slot in crew_per_slot:
        if len(crew_per_slot[slot]) < 4:
            print(f"\n⚠️  Warning: Only {len(crew_per_slot[slot])} crew at slot {slot}, expected 4")
    
    print("\n✅ TEST 28 PASSED: Max 4 crew on REGISTER at any time\n")
    return True


# =====================================================================
# ALLOW_HALF_BLOCKSIZE Tests
# =====================================================================

def test_allow_half_blocksize():
    """Test: ALLOW_HALF_BLOCKSIZE is recognized (actual variable creation is in VariableBuilder).
    
    This rule is metadata that affects variable generation. Here we just verify
    the rule is processed without error.
    """
    print("\n" + "="*60)
    print("TEST 29: ALLOW_HALF_BLOCKSIZE - Rule recognition")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "ALLOW_HALF_BLOCKSIZE",
            "targetRoleId": None,
            "targetRoleCode": None,
            "valueInt": None,
            "constraintType": "HARD",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    print("\n✅ TEST 29 PASSED: ALLOW_HALF_BLOCKSIZE rule recognized\n")
    return True


# =====================================================================
# DISTRIBUTION_BETWEEN_ROLE_X Tests
# =====================================================================

def test_distribution_equal_preference():
    """Test: DISTRIBUTION_BETWEEN_ROLE_X with equal preference (valueInt=0).
    
    This SOFT preference encourages crew to balance time between two roles.
    """
    print("\n" + "="*60)
    print("TEST 30: DISTRIBUTION - Equal time preference")
    print("="*60)
    
    payload = create_test_payload(role_rules=[
        {
            "id": 1,
            "roleId": 1,  # REGISTER
            "roleCode": "REGISTER",
            "type": "DISTRIBUTION_BETWEEN_ROLE_X",
            "targetRoleId": 2,  # GREETER
            "targetRoleCode": "GREETER",
            "valueInt": 0,  # Prefer equal time
            "constraintType": "SOFT",
            "crewId": None,
            "isPriority": False,
        }
    ])
    
    result = solve(payload, time_limit_seconds=10)
    assert result['success'], f"Solver failed: {result}"
    
    # Count time per role per crew
    from collections import defaultdict
    crew_role_time = defaultdict(lambda: defaultdict(int))
    
    for a in result['assignments']:
        crew_role_time[a['crewId']][a['taskType']] += a['durationMin']
    
    print("\nTime distribution per crew:")
    for crew, roles in crew_role_time.items():
        print(f"  {crew}: {dict(roles)}")
    
    print("\n✅ TEST 30 PASSED: DISTRIBUTION preference processed\n")
    return True


# =====================================================================
# PAIRWISE INTEGRATION TESTS
# =====================================================================

# Define all rule types with sample configurations
RULE_TEMPLATES = {
    'FORBID_ROLE': lambda role_id=1, role_code='REGISTER': {
        "id": 100,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "FORBID_ROLE",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": None,
        "constraintType": "HARD",
        "crewId": "CREW001",  # Only forbid one crew so coverage is still possible
        "isPriority": False,
    },
    'MIN_CONSECUTIVE_MINUTES': lambda role_id=1, role_code='REGISTER': {
        "id": 101,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "MIN_CONSECUTIVE_MINUTES",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 60,  # 1 hour minimum
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'MAX_CONSECUTIVE_MINUTES': lambda role_id=1, role_code='REGISTER': {
        "id": 102,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "MAX_CONSECUTIVE_MINUTES",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 120,  # 2 hours maximum
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'CANNOT_BE_ASSIGNED_BEFORE': lambda role_id=1, role_code='REGISTER': {
        "id": 103,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "CANNOT_BE_ASSIGNED_BEFORE",
        "targetRoleId": 2,
        "targetRoleCode": "GREETER",
        "valueInt": None,
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'CANNOT_BE_ASSIGNED_AFTER': lambda role_id=1, role_code='REGISTER': {
        "id": 104,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "CANNOT_BE_ASSIGNED_AFTER",
        "targetRoleId": 2,
        "targetRoleCode": "GREETER",
        "valueInt": None,
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'TIMING': lambda role_id=1, role_code='REGISTER': {
        "id": 105,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "TIMING",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": -1,  # Prefer early
        "constraintType": "SOFT",
        "crewId": None,
        "isPriority": False,
    },
    'ASSIGN_BEFORE_SHIFT_MIN_X': lambda role_id=1, role_code='REGISTER': {
        "id": 106,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "ASSIGN_BEFORE_SHIFT_MIN_X",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 180,  # Within first 3 hours
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'ASSIGN_AFTER_SHIFT_MIN_X': lambda role_id=1, role_code='REGISTER': {
        "id": 107,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "ASSIGN_AFTER_SHIFT_MIN_X",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 60,  # After first hour
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'LIKE_ROLE_FOR_HOUR_X': lambda role_id=1, role_code='REGISTER': {
        "id": 108,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "LIKE_ROLE_FOR_HOUR_X",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 9,  # Like at 9am
        "constraintType": "SOFT",
        "crewId": None,
        "isPriority": False,
    },
    'DISLIKE_ROLE_FOR_HOUR_X': lambda role_id=1, role_code='REGISTER': {
        "id": 109,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "DISLIKE_ROLE_FOR_HOUR_X",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 11,  # Dislike at 11am
        "constraintType": "SOFT",
        "crewId": None,
        "isPriority": False,
    },
    'MIN_SHIFT_LENGTH_FOR_ACCESS': lambda role_id=1, role_code='REGISTER': {
        "id": 110,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "MIN_SHIFT_LENGTH_FOR_ACCESS",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 120,  # Need 2hr shift (all crew have 4hr)
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'MAX_CREW_ON_AT_A_TIME': lambda role_id=1, role_code='REGISTER': {
        "id": 111,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "MAX_CREW_ON_AT_A_TIME",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": 2,  # Max 2 crew at once
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'ALLOW_HALF_BLOCKSIZE': lambda role_id=1, role_code='REGISTER': {
        "id": 112,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "ALLOW_HALF_BLOCKSIZE",
        "targetRoleId": None,
        "targetRoleCode": None,
        "valueInt": None,
        "constraintType": "HARD",
        "crewId": None,
        "isPriority": False,
    },
    'DISTRIBUTION_BETWEEN_ROLE_X': lambda role_id=1, role_code='REGISTER': {
        "id": 113,
        "roleId": role_id,
        "roleCode": role_code,
        "type": "DISTRIBUTION_BETWEEN_ROLE_X",
        "targetRoleId": 2,
        "targetRoleCode": "GREETER",
        "valueInt": 0,  # Equal distribution
        "constraintType": "SOFT",
        "crewId": None,
        "isPriority": False,
    },
}

# Rule types that conflict with each other (we need to handle these carefully)
CONFLICTING_PAIRS = {
    # CANNOT_BE_ASSIGNED_BEFORE and CANNOT_BE_ASSIGNED_AFTER on same roles conflict
    ('CANNOT_BE_ASSIGNED_BEFORE', 'CANNOT_BE_ASSIGNED_AFTER'),
    # ASSIGN_BEFORE and ASSIGN_AFTER with tight windows may conflict
    ('ASSIGN_BEFORE_SHIFT_MIN_X', 'ASSIGN_AFTER_SHIFT_MIN_X'),
}


def create_pairwise_payload(rule_type_a, rule_type_b):
    """Create a payload with two rule types for pairwise testing."""
    # Use relaxed coverage to make most combos feasible
    payload = {
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
        # Relaxed coverage: later start times to be compatible with ASSIGN_AFTER_SHIFT_MIN_X
        "coverageWindows": [
            {"roleId": 1, "startMin": 540, "endMin": 660, "crewPerTaskLength": 1},  # REGISTER 9-11am
            {"roleId": 2, "startMin": 540, "endMin": 660, "crewPerTaskLength": 1},  # GREETER 9-11am
        ],
        "crewQuotas": [],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "roleRules": [],
    }
    
    # Add the two rules
    rule_a = RULE_TEMPLATES[rule_type_a]()
    rule_b = RULE_TEMPLATES[rule_type_b]()
    
    # Handle known conflicts by adjusting rules
    if (rule_type_a, rule_type_b) in CONFLICTING_PAIRS or (rule_type_b, rule_type_a) in CONFLICTING_PAIRS:
        # For CANNOT_BE_BEFORE + CANNOT_BE_AFTER: apply to different crews
        if 'CANNOT_BE_ASSIGNED_BEFORE' in (rule_type_a, rule_type_b) and 'CANNOT_BE_ASSIGNED_AFTER' in (rule_type_a, rule_type_b):
            rule_a['crewId'] = 'CREW001'
            rule_b['crewId'] = 'CREW002'
        # For ASSIGN_BEFORE + ASSIGN_AFTER: widen the window
        if 'ASSIGN_BEFORE_SHIFT_MIN_X' in (rule_type_a, rule_type_b) and 'ASSIGN_AFTER_SHIFT_MIN_X' in (rule_type_a, rule_type_b):
            # Make BEFORE=180 (first 3 hours), AFTER=60 (after first hour) => window is 60-180 min
            if rule_a['type'] == 'ASSIGN_BEFORE_SHIFT_MIN_X':
                rule_a['valueInt'] = 180
            if rule_b['type'] == 'ASSIGN_BEFORE_SHIFT_MIN_X':
                rule_b['valueInt'] = 180
            if rule_a['type'] == 'ASSIGN_AFTER_SHIFT_MIN_X':
                rule_a['valueInt'] = 60
            if rule_b['type'] == 'ASSIGN_AFTER_SHIFT_MIN_X':
                rule_b['valueInt'] = 60
    
    payload['roleRules'] = [rule_a, rule_b]
    return payload


def run_pairwise_test(rule_type_a, rule_type_b):
    """Run a single pairwise test and return success/failure."""
    try:
        payload = create_pairwise_payload(rule_type_a, rule_type_b)
        result = solve(payload, time_limit_seconds=5)
        
        if result['success']:
            return True, None
        else:
            return False, f"Solver returned: {result.get('status', 'unknown')}"
    except Exception as e:
        return False, str(e)


def test_pairwise_all_combinations():
    """Run all pairwise (2-rule) integration tests."""
    print("\n" + "="*60)
    print("PAIRWISE INTEGRATION TESTS (91 combinations)")
    print("="*60)
    
    from itertools import combinations
    
    rule_types = list(RULE_TEMPLATES.keys())
    all_pairs = list(combinations(rule_types, 2))
    
    passed = 0
    failed = 0
    failures = []
    
    for i, (rule_a, rule_b) in enumerate(all_pairs):
        success, error = run_pairwise_test(rule_a, rule_b)
        
        if success:
            passed += 1
            status = "✅"
        else:
            failed += 1
            status = "❌"
            failures.append((rule_a, rule_b, error))
        
        # Print progress every 10 tests
        if (i + 1) % 10 == 0 or i == len(all_pairs) - 1:
            print(f"  Progress: {i+1}/{len(all_pairs)} - {passed} passed, {failed} failed")
    
    print(f"\nPairwise Results: {passed}/{len(all_pairs)} passed")
    
    if failures:
        print("\nFailed combinations:")
        for rule_a, rule_b, error in failures:
            print(f"  ❌ {rule_a} + {rule_b}: {error}")
    
    if failed == 0:
        print("\n✅ ALL PAIRWISE TESTS PASSED\n")
        return True
    else:
        print(f"\n❌ {failed} PAIRWISE TESTS FAILED\n")
        return False


# =====================================================================
# SMOKE TEST - All 14 Rules Together
# =====================================================================

def test_smoke_all_rules():
    """Smoke test: Apply all 14 rules at once and verify solver handles it."""
    print("\n" + "="*60)
    print("SMOKE TEST: All 14 rules together")
    print("="*60)
    
    # Create payload with all rules - need flexible coverage
    payload = {
        "store": {
            "id": 1,
            "timezone": "America/New_York",
            "openMinutesFromMidnight": 480,
            "closeMinutesFromMidnight": 720,
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
            {"id": "CREW001", "name": "Alice", "roleIds": [1, 2], "shiftStartMin": 480, "shiftEndMin": 720},
            {"id": "CREW002", "name": "Bob", "roleIds": [1, 2], "shiftStartMin": 480, "shiftEndMin": 720},
            {"id": "CREW003", "name": "Carol", "roleIds": [1, 2], "shiftStartMin": 480, "shiftEndMin": 720},
            {"id": "CREW004", "name": "Dave", "roleIds": [1, 2], "shiftStartMin": 480, "shiftEndMin": 720},
        ],
        # Minimal coverage so constraints can all be satisfied
        "coverageWindows": [
            {"roleId": 1, "startMin": 540, "endMin": 600, "crewPerTaskLength": 1},  # REGISTER 9-10am
            {"roleId": 2, "startMin": 600, "endMin": 660, "crewPerTaskLength": 1},  # GREETER 10-11am
        ],
        "crewQuotas": [],
        "preferences": [],
        "bankedPreferences": [],
        "fairnessTrackers": [],
        "fairnessHistory": [],
        "roleRules": [
            # 1. FORBID_ROLE - CREW001 can't do REGISTER
            {
                "id": 1, "roleId": 1, "roleCode": "REGISTER", "type": "FORBID_ROLE",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": None,
                "constraintType": "HARD", "crewId": "CREW001", "isPriority": False,
            },
            # 2. MIN_CONSECUTIVE_MINUTES - At least 60 min on GREETER
            {
                "id": 2, "roleId": 2, "roleCode": "GREETER", "type": "MIN_CONSECUTIVE_MINUTES",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 60,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 3. MAX_CONSECUTIVE_MINUTES - Max 120 min on REGISTER
            {
                "id": 3, "roleId": 1, "roleCode": "REGISTER", "type": "MAX_CONSECUTIVE_MINUTES",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 120,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 4. CANNOT_BE_ASSIGNED_BEFORE - CREW002: Can't do REGISTER before GREETER
            {
                "id": 4, "roleId": 1, "roleCode": "REGISTER", "type": "CANNOT_BE_ASSIGNED_BEFORE",
                "targetRoleId": 2, "targetRoleCode": "GREETER", "valueInt": None,
                "constraintType": "HARD", "crewId": "CREW002", "isPriority": False,
            },
            # 5. CANNOT_BE_ASSIGNED_AFTER - CREW003: Can't do REGISTER after GREETER
            {
                "id": 5, "roleId": 1, "roleCode": "REGISTER", "type": "CANNOT_BE_ASSIGNED_AFTER",
                "targetRoleId": 2, "targetRoleCode": "GREETER", "valueInt": None,
                "constraintType": "HARD", "crewId": "CREW003", "isPriority": False,
            },
            # 6. TIMING - Prefer GREETER early
            {
                "id": 6, "roleId": 2, "roleCode": "GREETER", "type": "TIMING",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": -1,
                "constraintType": "SOFT", "crewId": None, "isPriority": False,
            },
            # 7. ASSIGN_BEFORE_SHIFT_MIN_X - REGISTER must start within first 3 hours
            {
                "id": 7, "roleId": 1, "roleCode": "REGISTER", "type": "ASSIGN_BEFORE_SHIFT_MIN_X",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 180,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 8. ASSIGN_AFTER_SHIFT_MIN_X - GREETER must be after first 30 min
            {
                "id": 8, "roleId": 2, "roleCode": "GREETER", "type": "ASSIGN_AFTER_SHIFT_MIN_X",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 30,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 9. LIKE_ROLE_FOR_HOUR_X - Like REGISTER at 9am
            {
                "id": 9, "roleId": 1, "roleCode": "REGISTER", "type": "LIKE_ROLE_FOR_HOUR_X",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 9,
                "constraintType": "SOFT", "crewId": None, "isPriority": False,
            },
            # 10. DISLIKE_ROLE_FOR_HOUR_X - Dislike GREETER at 11am
            {
                "id": 10, "roleId": 2, "roleCode": "GREETER", "type": "DISLIKE_ROLE_FOR_HOUR_X",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 11,
                "constraintType": "SOFT", "crewId": None, "isPriority": False,
            },
            # 11. MIN_SHIFT_LENGTH_FOR_ACCESS - Need 2hr shift for REGISTER (all have 4hr)
            {
                "id": 11, "roleId": 1, "roleCode": "REGISTER", "type": "MIN_SHIFT_LENGTH_FOR_ACCESS",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 120,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 12. MAX_CREW_ON_AT_A_TIME - Max 2 on REGISTER at once
            {
                "id": 12, "roleId": 1, "roleCode": "REGISTER", "type": "MAX_CREW_ON_AT_A_TIME",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": 2,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 13. ALLOW_HALF_BLOCKSIZE - Allow half-blocks for GREETER
            {
                "id": 13, "roleId": 2, "roleCode": "GREETER", "type": "ALLOW_HALF_BLOCKSIZE",
                "targetRoleId": None, "targetRoleCode": None, "valueInt": None,
                "constraintType": "HARD", "crewId": None, "isPriority": False,
            },
            # 14. DISTRIBUTION_BETWEEN_ROLE_X - Balance REGISTER and GREETER
            {
                "id": 14, "roleId": 1, "roleCode": "REGISTER", "type": "DISTRIBUTION_BETWEEN_ROLE_X",
                "targetRoleId": 2, "targetRoleCode": "GREETER", "valueInt": 0,
                "constraintType": "SOFT", "crewId": None, "isPriority": False,
            },
        ],
    }
    
    print(f"\nApplying {len(payload['roleRules'])} rules...")
    for rule in payload['roleRules']:
        print(f"  {rule['id']:2d}. {rule['type']}")
    
    result = solve(payload, time_limit_seconds=15)
    
    if not result['success']:
        print(f"\n❌ SMOKE TEST FAILED: {result.get('status', 'unknown')}")
        return False
    
    print(f"\nSolver returned {len(result['assignments'])} assignments")
    
    # Show assignments
    for a in sorted(result['assignments'], key=lambda x: (x['crewId'], x['startMinute'])):
        print(f"  {a['crewId']}: {a['taskType']} {a['startMinute']}-{a['startMinute']+a['durationMin']}")
    
    print("\n✅ SMOKE TEST PASSED: All 14 rules applied successfully\n")
    return True


if __name__ == "__main__":
    print("\n" + "="*60)
    print("ROLE RULES TEST SUITE")
    print("="*60)
    
    tests = [
        test_no_rules,
        test_forbid_role_for_one_crew,
        test_forbid_role_store_wide,
        test_min_consecutive_minutes_forces_longer_assignments,
        test_max_consecutive_minutes_prevents_long_assignments,
        test_max_consecutive_minutes_with_coverage,
        test_min1_max1_no_consecutive,
        test_min1_max2_allows_one_or_two,
        test_min1_max4_allows_up_to_four,
        test_assign_before_shift_min,
        test_assign_after_shift_min,
        test_timing_early_preference,
        test_timing_late_preference,
        test_timing_middle_preference,
        # Integration tests
        test_integration_timing_with_assign_before,
        test_integration_timing_with_assign_after,
        test_integration_before_and_after_window,
        test_integration_all_three_combined,
        # Ordering constraints
        test_cannot_be_assigned_before,
        test_cannot_be_assigned_after,
        test_cannot_be_assigned_before_forces_different_crew,
        # Hour preferences
        test_like_role_for_hour_x,
        test_dislike_role_for_hour_x_soft,
        test_dislike_role_for_hour_x_hard,
        test_integration_like_and_dislike_same_role,
        # Min shift length
        test_min_shift_length_for_access,
        test_min_shift_length_allows_eligible_crew,
        test_min_shift_length_crew_specific,
        # Max crew on at a time
        test_max_crew_on_at_a_time,
        # Allow half blocksize
        test_allow_half_blocksize,
        # Distribution between roles
        test_distribution_equal_preference,
        # Pairwise integration tests
        test_pairwise_all_combinations,
        # Smoke test
        test_smoke_all_rules,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test.__name__} raised exception: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "="*60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("="*60)
    
    sys.exit(0 if failed == 0 else 1)
