"""Debug infeasibility by checking every constraint type for potential issues."""

import json
import math
import sys
from collections import defaultdict

_cached_data = None

def load_data():
    global _cached_data
    if _cached_data is None:
        # Get filename from command line or use default
        filename = sys.argv[1] if len(sys.argv) > 1 else '../api/solver_input_store768_2025-11-25.json'
        with open(filename, 'r') as f:
            _cached_data = json.load(f)
    return _cached_data


def _build_assignment_index(role_metadata):
    index = defaultdict(set)
    for meta in role_metadata:
        role = meta.get('role') if isinstance(meta, dict) else None
        model = meta.get('assignmentModel') if isinstance(meta, dict) else None
        if not role or model is None:
            continue

        if isinstance(model, (list, tuple, set)):
            models = {str(m).upper() for m in model if m}
        else:
            models = {str(model).upper()}

        for normalized in models:
            index[normalized].add(role)
    return index


def _universal_roles(role_metadata):
    assignment_index = _build_assignment_index(role_metadata)
    universal = set(assignment_index.get('HOURLY', set())) | set(assignment_index.get('SOLVER', set()))
    if not universal:
        universal = {'REGISTER', 'PRODUCT', 'PARKING_HELM'}
    return universal, assignment_index


def _format_slot_label(slot, slot_minutes):
    minutes = slot * slot_minutes
    hour = minutes // 60
    minute = minutes % 60
    return f"{hour:02d}:{minute:02d}"


def _max_defined(*values):
    defined = [v for v in values if v is not None]
    return max(defined) if defined else None


def check_crew_coverage():
    """Check if every crew slot can be assigned to at least one role."""
    data = load_data()
    universal_roles, _ = _universal_roles(data.get('roleMetadata', []))
    
    print("="*80)
    print("CONSTRAINT 1: Can every crew slot be assigned?")
    print("="*80)
    
    issues = []
    
    print(f"\nUniversal roles (HOURLY + SOLVER assignment models): {sorted(universal_roles)}")
    
    for crew in data['crew']:
        crew_id = crew['id']
        crew_name = crew['name']
        shift_start = crew['shiftStartMin']
        shift_end = crew['shiftEndMin']
        eligible_roles = crew.get('eligibleRoles', [])
        
        num_slots = (shift_end - shift_start) // 30
        
        # Crew can work universal roles + their eligible roles
        all_available_roles = set(universal_roles) | set(eligible_roles)
        
        # Check if crew has ANY roles available
        if not all_available_roles:
            issues.append({
                'crew': crew_name,
                'crew_id': crew_id,
                'issue': 'No roles available (neither HOURLY nor eligible)',
                'slots_needed': num_slots
            })
    
    if issues:
        print(f"\n❌ Found {len(issues)} crew with no roles available:")
        for issue in issues:
            print(f"  - {issue['crew']} ({issue['crew_id']}): {issue['slots_needed']} slots need assignment")
    else:
        print("\n✅ All crew have at least one role available (universal or eligible)")
    
    return issues

def check_crew_role_requirements():
    """Check if crew role requirements can be satisfied."""
    data = load_data()
    
    print("\n" + "="*80)
    print("CONSTRAINT 2: Crew Role Requirements (ORDER_WRITER, etc.)")
    print("="*80)
    
    issues = []
    
    # Build crew map
    crew_by_id = {c['id']: c for c in data['crew']}
    
    for req in data['crewRoleRequirements']:
        crew_id = req['crewId']
        role = req['role']
        required_hours = req['requiredHours']
        required_slots = required_hours * 2  # 30-min slots
        
        crew = crew_by_id.get(crew_id)
        if not crew:
            issues.append({
                'type': 'crew_not_found',
                'crew_id': crew_id,
                'role': role,
                'required_hours': required_hours
            })
            continue
        
        crew_name = crew['name']
        eligible_roles = crew.get('eligibleRoles', [])
        shift_start = crew['shiftStartMin']
        shift_end = crew['shiftEndMin']
        total_slots = (shift_end - shift_start) // 30
        
        # Check if role is in eligible roles
        if role not in eligible_roles:
            issues.append({
                'type': 'role_not_eligible',
                'crew': crew_name,
                'crew_id': crew_id,
                'role': role,
                'required_hours': required_hours,
                'eligible_roles': eligible_roles
            })
            continue
        
        # Check if shift is long enough
        if required_slots > total_slots:
            issues.append({
                'type': 'shift_too_short',
                'crew': crew_name,
                'crew_id': crew_id,
                'role': role,
                'required_hours': required_hours,
                'shift_hours': total_slots / 2,
                'shortage': (required_slots - total_slots) / 2
            })
    
    if issues:
        print(f"\n❌ Found {len(issues)} crew role requirement issues:")
        for issue in issues:
            if issue['type'] == 'role_not_eligible':
                print(f"  - {issue['crew']}: Requires {issue['required_hours']}h of {issue['role']}, but role NOT in eligibleRoles {issue['eligible_roles']}")
            elif issue['type'] == 'shift_too_short':
                print(f"  - {issue['crew']}: Requires {issue['required_hours']}h of {issue['role']}, but shift only {issue['shift_hours']}h (short by {issue['shortage']}h)")
            elif issue['type'] == 'crew_not_found':
                print(f"  - Crew {issue['crew_id']} not found but has {issue['required_hours']}h requirement for {issue['role']}")
    else:
        print("\n✅ All crew role requirements are potentially satisfiable")
    
    return issues

def check_hourly_requirements():
    """Check if hourly staffing requirements can be met."""
    data = load_data()
    universal_roles, _ = _universal_roles(data.get('roleMetadata', []))
    
    print("\n" + "="*80)
    print("CONSTRAINT 3: Hourly Staffing Requirements")
    print("="*80)
    
    issues = []
    
    # Count available crew per hour per role
    crew_available = defaultdict(lambda: defaultdict(int))
    
    for crew in data['crew']:
        crew_id = crew['id']
        shift_start = crew['shiftStartMin']
        shift_end = crew['shiftEndMin']
        eligible_roles = crew.get('eligibleRoles', [])
        
        # Add universal roles
        all_roles = set(eligible_roles) | set(universal_roles)
        
        for hour in range(24):
            hour_start = hour * 60
            hour_end = (hour + 1) * 60
            
            # Check if crew works during this hour
            if shift_start < hour_end and shift_end > hour_start:
                for role in all_roles:
                    crew_available[hour][role] += 1
    
    for req in data['hourlyRequirements']:
        hour = req.get('hour')
        
        if hour is None:
            continue
        
        # Check each role type in the requirement
        for role_key, role_name in [
            ('requiredRegister', 'REGISTER'),
            ('requiredProduct', 'PRODUCT'),
            ('requiredParkingHelm', 'PARKING_HELM')
        ]:
            required = req.get(role_key, 0)
            if required == 0:
                continue
                
            available = crew_available[hour][role_name]
            
            if available < required:
                issues.append({
                    'hour': hour,
                    'role': role_name,
                    'required': required,
                    'available': available,
                    'shortage': required - available
                })
    
    if issues:
        print(f"\n❌ Found {len(issues)} hourly requirement issues:")
        for issue in issues:
            print(f"  - Hour {issue['hour']:2d}:00 {issue['role']:<15s}: Need {issue['required']}, only {issue['available']} available (short {issue['shortage']})")
    else:
        print("\n✅ All hourly requirements can potentially be met")
    
    return issues

def check_coverage_windows():
    """Check if coverage windows can be satisfied."""
    data = load_data()
    
    print("\n" + "="*80)
    print("CONSTRAINT 4: Coverage Windows (DEMO, WINE_DEMO)")
    print("="*80)
    
    issues = []
    
    for window in data['coverageWindows']:
        role = window['role']
        start_hour = window['startHour']
        end_hour = window['endHour']
        required_per_hour = window['requiredPerHour']
        
        # Count crew eligible for this role during the window
        crew_count_per_hour = defaultdict(int)
        
        for crew in data['crew']:
            eligible_roles = crew.get('eligibleRoles', [])
            if role not in eligible_roles:
                continue
            
            shift_start = crew['shiftStartMin']
            shift_end = crew['shiftEndMin']
            
            for hour in range(start_hour, end_hour):
                hour_start = hour * 60
                hour_end = (hour + 1) * 60
                
                if shift_start < hour_end and shift_end > hour_start:
                    crew_count_per_hour[hour] += 1
        
        for hour in range(start_hour, end_hour):
            available = crew_count_per_hour[hour]
            if available < required_per_hour:
                issues.append({
                    'role': role,
                    'hour': hour,
                    'required': required_per_hour,
                    'available': available,
                    'shortage': required_per_hour - available
                })
    
    if issues:
        print(f"\n❌ Found {len(issues)} coverage window issues:")
        for issue in issues:
            print(f"  - {issue['role']} at hour {issue['hour']:2d}:00: Need {issue['required']}, only {issue['available']} eligible crew available (short {issue['shortage']})")
    else:
        print("\n✅ All coverage windows can potentially be satisfied")
    
    return issues

def check_decision_variables():
    """Check decision variable creation logic."""
    from logbook_solver.core import LogbookSolver
    
    data = load_data()
    solver = LogbookSolver(data)
    
    print("\n" + "="*80)
    print("CONSTRAINT 5: Decision Variables Created Correctly")
    print("="*80)
    
    issues = []
    
    # Check each crew role requirement has variables
    crew_by_id = {c['id']: c for c in data['crew']}
    
    for req in data['crewRoleRequirements']:
        crew_id = req['crewId']
        role = req['role']
        required_hours = req['requiredHours']
        required_slots = required_hours * 2
        
        # Count variables for this crew-role combo
        var_count = sum(1 for (c, s, r) in solver.x if c == crew_id and r == role)
        
        crew = crew_by_id.get(crew_id, {})
        crew_name = crew.get('name', crew_id)
        
        if var_count < required_slots:
            issues.append({
                'crew': crew_name,
                'crew_id': crew_id,
                'role': role,
                'required_slots': required_slots,
                'variables_created': var_count,
                'shortage': required_slots - var_count
            })
    
    if issues:
        print(f"\n❌ Found {len(issues)} decision variable issues:")
        for issue in issues:
            print(f"  - {issue['crew']} ({issue['crew_id']}): {issue['role']} needs {issue['required_slots']} slots, only {issue['variables_created']} variables created (short {issue['shortage']})")
    else:
        print(f"\n✅ All required variables created")
        print(f"   Total decision variables: {len(solver.x)}")
        print(f"   DAILY roles: {sorted(solver._daily_roles)}")
        print(f"   HOURLY roles: {sorted(solver._hourly_roles)}")
        print(f"   SOLVER roles: {sorted(getattr(solver, '_solver_roles', set()))}")
        print(f"   HOURLY_WINDOW roles: {sorted(solver._hourly_window_roles)}")
        print(f"   Crew with daily requirements: {len(solver._crew_daily_requirements)}")
    
    return issues

def check_role_capacity():
    """Verify each crew has enough role capacity (respecting maxSlots/blockSize) to cover their shift."""
    from logbook_solver.core import LogbookSolver

    data = load_data()
    solver = LogbookSolver(data)

    print("\n" + "="*80)
    print("CONSTRAINT 6: Total Role Capacity per Crew")
    print("="*80)

    issues = []
    slots_per_hour = solver.slots_per_hour

    crew_role_slots = defaultdict(lambda: defaultdict(list))
    for (crew_id, slot, role), _var in solver.x.items():
        crew_role_slots[crew_id][role].append(slot)

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))
        shift_slots = max(0, shift_end - shift_start)
        if shift_slots == 0:
            continue

        role_map = crew_role_slots.get(crew_id, {})
        total_capacity = 0
        role_details = []

        for role, slot_indices in role_map.items():
            if not slot_indices:
                continue
            block_size = solver.role_meta_map.get(role, {}).get('blockSize', 1) or 1
            block_size = int(block_size)
            contiguous_capacity = len(slot_indices)
            if block_size > 1:
                run = 0
                cap = 0
                prev = None
                for slot in slot_indices:
                    if prev is not None and slot == prev + 1:
                        run += 1
                    else:
                        cap += (run // block_size) * block_size
                        run = 1
                    prev = slot
                cap += (run // block_size) * block_size
                contiguous_capacity = cap

            max_slots = solver.role_meta_map.get(role, {}).get('maxSlots')
            if max_slots is not None:
                contiguous_capacity = min(contiguous_capacity, max_slots)

            if contiguous_capacity <= 0:
                continue

            total_capacity += contiguous_capacity
            role_details.append((role, contiguous_capacity))

        if total_capacity + 1e-9 >= shift_slots:
            continue

        issues.append({
            'crew': crew.get('name', crew_id),
            'shift_hours': shift_slots / slots_per_hour,
            'capacity_hours': total_capacity / slots_per_hour,
            'details': role_details,
        })

    if issues:
        print(f"\n❌ Found {len(issues)} crews with insufficient role capacity:")
        for issue in issues[:10]:
            detail = ", ".join(
                f"{role}≤{slots / slots_per_hour:.1f}h" for role, slots in sorted(issue['details'], key=lambda x: -x[1])
            ) or "no eligible roles"
            print(
                f"  - {issue['crew']}: shift {issue['shift_hours']:.1f}h vs capacity {issue['capacity_hours']:.1f}h ({detail})"
            )
        if len(issues) > 10:
            print(f"  ... {len(issues) - 10} more crews truncated")
    else:
        print("\n✅ Every crew has enough role capacity to cover their shift")

    return issues


def check_shift_time_budget():
    """Flag crews whose mandatory time exceeds their shift length."""
    from logbook_solver.core import LogbookSolver

    data = load_data()
    solver = LogbookSolver(data)

    print("\n" + "="*80)
    print("CONSTRAINT 7: Minimum Time Budget per Crew")
    print("="*80)

    issues = []
    slots_per_hour = solver.slots_per_hour

    crew_role_slots = defaultdict(lambda: defaultdict(list))
    for (crew_id, slot, role), _var in solver.x.items():
        crew_role_slots[crew_id][role].append(slot)

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))
        shift_slots = max(0, shift_end - shift_start)
        if shift_slots == 0:
            continue

        min_demand = 0
        details = []

        for (req_crew_id, role), required_hours in solver._crew_daily_requirements.items():
            if req_crew_id != crew_id:
                continue
            required_slots = int(round(required_hours * slots_per_hour))
            if required_slots <= 0:
                continue
            min_demand += required_slots
            details.append(f"{role} requirement={required_slots}")

        for role, role_meta in solver.role_meta_map.items():
            slot_indices = sorted(set(crew_role_slots[crew_id][role]))
            if not slot_indices:
                continue
            role_min_slots = role_meta.get('minSlots')
            if role_min_slots is None:
                minutes = role_meta.get('minMinutesPerCrew')
                if minutes is not None:
                    role_min_slots = math.ceil(minutes / solver.slot_minutes - 1e-9)

            crew_min_slots = None
            if role == 'REGISTER':
                min_hours = crew.get('minRegisterHours')
                if min_hours is not None and min_hours > 0:
                    crew_min_slots = math.ceil(min_hours * slots_per_hour - 1e-9)

            effective_min = _max_defined(role_min_slots, crew_min_slots)
            if effective_min:
                min_demand += effective_min
                details.append(f"{role} minSlots={effective_min}")

        if min_demand > shift_slots + 1e-9:
            issues.append({
                'crew': crew.get('name', crew_id),
                'shift_hours': shift_slots / slots_per_hour,
                'demand_hours': min_demand / slots_per_hour,
                'details': details,
            })

    if issues:
        print(f"\n❌ Found {len(issues)} crews with impossible minimum time budgets:")
        for issue in issues[:10]:
            detail = ", ".join(issue['details'][:4])
            if len(issue['details']) > 4:
                detail += ", ..."
            print(
                f"  - {issue['crew']}: min {issue['demand_hours']:.1f}h vs shift {issue['shift_hours']:.1f}h ({detail})"
            )
        if len(issues) > 10:
            print(f"  ... {len(issues) - 10} more crews truncated")
    else:
        print("\n✅ All crews can fit mandatory time into their shifts")

    return issues

def check_slot_role_variables():
    """Ensure every crew slot inside store hours has at least one decision variable."""
    from logbook_solver.core import LogbookSolver

    data = load_data()
    solver = LogbookSolver(data)

    print("\n" + "="*80)
    print("CONSTRAINT 8: Slot-Level Role Availability")
    print("="*80)

    issues = []
    slot_presence = defaultdict(int)
    for (crew_id, slot, _role), _var in solver.x.items():
        slot_presence[(crew_id, slot)] += 1

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))

        for slot in range(shift_start, shift_end):
            if slot >= solver.num_slots:
                break
            if slot_presence.get((crew_id, slot)):
                continue
            if not solver._slot_inside_store_hours(slot):
                continue

            issues.append({
                'crew': crew.get('name', crew_id),
                'slot': slot,
                'label': _format_slot_label(slot, solver.slot_minutes),
            })

    if issues:
        print(f"\n❌ Found {len(issues)} slots with zero available roles. Example entries:")
        for issue in issues[:10]:
            print(f"  - {issue['crew']}: slot {issue['slot']} ({issue['label']}) has no role variables")
        if len(issues) > 10:
            print(f"  ... {len(issues) - 10} more slots truncated")
    else:
        print("\n✅ Every in-shift slot has at least one available role variable")

    return issues

def main():
    print("\n" + "="*80)
    print("INFEASIBILITY DEBUGGER")
    print("="*80)
    
    all_issues = []
    
    all_issues.extend(check_crew_coverage())
    all_issues.extend(check_crew_role_requirements())
    all_issues.extend(check_hourly_requirements())
    all_issues.extend(check_coverage_windows())
    all_issues.extend(check_decision_variables())
    all_issues.extend(check_role_capacity())
    all_issues.extend(check_shift_time_budget())
    all_issues.extend(check_slot_role_variables())
    
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if all_issues:
        print(f"\n❌ Found {len(all_issues)} total issues that could cause infeasibility")
        print("\nReview the issues above to determine what's making the schedule infeasible.")
    else:
        print("\n✅ No obvious issues found!")
        print("\nThe infeasibility may be due to:")
        print("  - Constraint interactions (e.g., coverage windows + crew requirements)")
        print("  - Break requirements in specific time windows")
        print("  - Consecutive slot requirements")
        print("  - Block size constraints")

if __name__ == '__main__':
    main()
