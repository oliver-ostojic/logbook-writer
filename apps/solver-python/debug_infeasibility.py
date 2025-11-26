"""Debug infeasibility by checking every constraint type for potential issues."""

import json
import sys
from collections import defaultdict

_cached_data = None

def load_data():
    global _cached_data
    if _cached_data is None:
        # Get filename from command line or use default
        filename = sys.argv[1] if len(sys.argv) > 1 else 'solver_input_11_22.json'
        with open(filename, 'r') as f:
            _cached_data = json.load(f)
    return _cached_data

def check_crew_coverage():
    """Check if every crew slot can be assigned to at least one role."""
    data = load_data()
    
    print("="*80)
    print("CONSTRAINT 1: Can every crew slot be assigned?")
    print("="*80)
    
    issues = []
    
    # Get HOURLY roles (available to all crew)
    hourly_roles = [
        r['role'] for r in data['roleMetadata'] 
        if r.get('assignmentModel') == 'HOURLY'
    ]
    
    print(f"\nHOURLY roles (available to all crew): {hourly_roles}")
    
    for crew in data['crew']:
        crew_id = crew['id']
        crew_name = crew['name']
        shift_start = crew['shiftStartMin']
        shift_end = crew['shiftEndMin']
        eligible_roles = crew.get('eligibleRoles', [])
        
        num_slots = (shift_end - shift_start) // 30
        
        # Crew can work HOURLY roles + their eligible roles
        all_available_roles = set(hourly_roles) | set(eligible_roles)
        
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
        print("\n✅ All crew have at least one role available (HOURLY or eligible)")
    
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
        all_roles = set(eligible_roles) | {'REGISTER', 'PRODUCT', 'PARKING_HELM'}
        
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
        print(f"   HOURLY_WINDOW roles: {sorted(solver._hourly_window_roles)}")
        print(f"   Crew with daily requirements: {len(solver._crew_daily_requirements)}")
    
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
