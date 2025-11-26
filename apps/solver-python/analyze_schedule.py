#!/usr/bin/env python3
"""
Analyze solver output and generate visual tables to verify constraints
"""

import json
import sys
from collections import defaultdict
from typing import Dict, List, Set

def minutes_to_time(minutes: int) -> str:
    """Convert minutes from midnight to HH:MM format"""
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"

def load_json(filename: str) -> dict:
    """Load JSON file"""
    with open(filename, 'r') as f:
        return json.load(f)

def analyze_crew_schedule(crew_id: str, assignments: List[dict], input_data: dict) -> dict:
    """Analyze schedule for a single crew member"""
    crew_assignments = [a for a in assignments if a['crewId'] == crew_id]
    crew_assignments.sort(key=lambda x: x['startTime'])
    
    # Find crew info
    crew_info = next((c for c in input_data['crew'] if c['id'] == crew_id), None)
    if not crew_info:
        return {}
    
    # Count assignments by task type
    task_counts = defaultdict(int)
    task_minutes = defaultdict(int)
    for a in crew_assignments:
        task_counts[a['taskType']] += 1
        task_minutes[a['taskType']] += (a['endTime'] - a['startTime'])
    
    # Check for breaks (check both BREAK and MEAL_BREAK)
    has_break = 'BREAK' in task_counts or 'MEAL_BREAK' in task_counts
    shift_length = crew_info['shiftEndMin'] - crew_info['shiftStartMin']
    needs_break = shift_length >= input_data['storeMetadata']['reqShiftLengthForBreak']
    
    # Check for gaps
    gaps = []
    for i in range(len(crew_assignments) - 1):
        if crew_assignments[i]['endTime'] != crew_assignments[i+1]['startTime']:
            gaps.append({
                'after': crew_assignments[i]['taskType'],
                'gap_start': crew_assignments[i]['endTime'],
                'gap_end': crew_assignments[i+1]['startTime'],
                'gap_minutes': crew_assignments[i+1]['startTime'] - crew_assignments[i]['endTime']
            })
    
    # Check consecutive constraints
    consecutive_violations = []
    for i in range(len(crew_assignments) - 1):
        curr = crew_assignments[i]
        next_a = crew_assignments[i + 1]
        
        # Check if tasks that should be consecutive are broken
        if curr['taskType'] == next_a['taskType']:
            if curr['endTime'] != next_a['startTime']:
                consecutive_violations.append(f"{curr['taskType']} broken at {minutes_to_time(curr['endTime'])}")
    
    return {
        'name': crew_info['name'],
        'shift': f"{minutes_to_time(crew_info['shiftStartMin'])}-{minutes_to_time(crew_info['shiftEndMin'])}",
        'shift_minutes': shift_length,
        'eligible_roles': crew_info['eligibleRoles'],
        'task_counts': dict(task_counts),
        'task_hours': {k: v/60 for k, v in task_minutes.items()},
        'has_break': has_break,
        'needs_break': needs_break,
        'break_violation': needs_break and not has_break,
        'gaps': gaps,
        'consecutive_violations': consecutive_violations,
        'total_assignments': len(crew_assignments)
    }

def check_hourly_requirements(assignments: List[dict], requirements: List[dict]) -> List[dict]:
    """Check if hourly requirements are met"""
    violations = []
    
    for req in requirements:
        hour = req['hour']
        hour_start = hour * 60
        hour_end = (hour + 1) * 60
        
        # Count actual crew on each task during this hour
        register_count = 0
        product_count = 0
        parking_count = 0
        
        for a in assignments:
            # Check if assignment overlaps with this hour
            if a['startTime'] < hour_end and a['endTime'] > hour_start:
                if a['taskType'] == 'REGISTER':
                    register_count += 1
                elif a['taskType'] == 'PRODUCT':
                    product_count += 1
                elif a['taskType'] == 'PARKING_HELM':
                    parking_count += 1
        
        # Check violations
        if register_count < req['requiredRegister']:
            violations.append({
                'hour': hour,
                'type': 'REGISTER',
                'required': req['requiredRegister'],
                'actual': register_count,
                'shortage': req['requiredRegister'] - register_count
            })
        
        if product_count < req['requiredProduct']:
            violations.append({
                'hour': hour,
                'type': 'PRODUCT',
                'required': req['requiredProduct'],
                'actual': product_count,
                'shortage': req['requiredProduct'] - product_count
            })
    
    return violations

def check_crew_role_requirements(assignments: List[dict], requirements: List[dict]) -> List[dict]:
    """Check if crew-specific role requirements are met"""
    violations = []
    
    for req in requirements:
        crew_id = req['crewId']
        role = req['role']
        required_hours = req['requiredHours']
        
        # Calculate actual hours for this crew on this role
        actual_minutes = sum(
            a['endTime'] - a['startTime']
            for a in assignments
            if a['crewId'] == crew_id and a['taskType'] == role
        )
        actual_hours = actual_minutes / 60
        
        if actual_hours < required_hours - 0.01:  # Small tolerance for floating point
            violations.append({
                'crewId': crew_id,
                'role': role,
                'required_hours': required_hours,
                'actual_hours': actual_hours,
                'shortage_hours': required_hours - actual_hours
            })
    
    return violations

def check_coverage_windows(assignments: List[dict], windows: List[dict]) -> List[dict]:
    """Check if coverage window requirements are met"""
    violations = []
    
    for window in windows:
        role = window['role']
        start_hour = window['startHour']
        end_hour = window['endHour']
        required_per_hour = window['requiredPerHour']
        
        # Check each hour in the window
        for hour in range(start_hour, end_hour):
            hour_start = hour * 60
            hour_end = (hour + 1) * 60
            
            # Count unique crew assigned to this role during this hour
            crew_in_hour = set()
            for a in assignments:
                if a['taskType'] == role and a['startTime'] < hour_end and a['endTime'] > hour_start:
                    crew_in_hour.add(a['crewId'])
            
            actual_count = len(crew_in_hour)
            if actual_count < required_per_hour:
                violations.append({
                    'role': role,
                    'hour': hour,
                    'required': required_per_hour,
                    'actual': actual_count,
                    'shortage': required_per_hour - actual_count
                })
    
    return violations

def print_crew_timeline(crew_id: str, assignments: List[dict], input_data: dict):
    """Print a visual timeline for a crew member"""
    crew_assignments = [a for a in assignments if a['crewId'] == crew_id]
    crew_assignments.sort(key=lambda x: x['startTime'])
    
    crew_info = next((c for c in input_data['crew'] if c['id'] == crew_id), None)
    if not crew_info:
        return
    
    print(f"\n{'='*80}")
    print(f"Crew: {crew_info['name']} ({crew_id})")
    print(f"Shift: {minutes_to_time(crew_info['shiftStartMin'])} - {minutes_to_time(crew_info['shiftEndMin'])}")
    print(f"Eligible Roles: {', '.join(crew_info['eligibleRoles']) if crew_info['eligibleRoles'] else 'None'}")
    print(f"{'='*80}")
    
    for a in crew_assignments:
        start_time = minutes_to_time(a['startTime'])
        end_time = minutes_to_time(a['endTime'])
        duration = a['endTime'] - a['startTime']
        print(f"{start_time} - {end_time} ({duration:3d}m): {a['taskType']}")

def main():
    import sys
    
    # Use command line arguments if provided
    if len(sys.argv) >= 3:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
    else:
        input_file = 'solver_input_11_22_unwrapped.json'
        output_file = 'solver_output_11_22_test.json'
    
    # Load output
    output = load_json(output_file)
    
    # Load input
    input_data = load_json(input_file)
    
    print("="*80)
    print("SOLVER OUTPUT ANALYSIS")
    print("="*80)
    print(f"\nStatus: {output['metadata']['status']}")
    print(f"Runtime: {output['metadata']['runtimeMs']}ms")
    print(f"Objective Score: {output['metadata']['objectiveScore']}")
    print(f"Total Assignments: {output['metadata']['numAssignments']}")
    print(f"Crew Count: {output['metadata']['numCrew']}")
    
    assignments = output['assignments']
    
    # Check 1: Hourly Requirements
    print("\n" + "="*80)
    print("CONSTRAINT CHECK 1: HOURLY REQUIREMENTS")
    print("="*80)
    hourly_violations = check_hourly_requirements(assignments, input_data['hourlyRequirements'])
    if hourly_violations:
        print(f"\n❌ Found {len(hourly_violations)} hourly requirement violations:\n")
        for v in hourly_violations:
            print(f"  Hour {v['hour']:2d}:00 - {v['type']:<15s} Required: {v['required']:2d}, Actual: {v['actual']:2d}, Short: {v['shortage']}")
    else:
        print("\n✅ All hourly requirements met!")
    
    # Check 2: Crew Role Requirements
    print("\n" + "="*80)
    print("CONSTRAINT CHECK 2: CREW-SPECIFIC ROLE REQUIREMENTS")
    print("="*80)
    crew_role_violations = check_crew_role_requirements(assignments, input_data['crewRoleRequirements'])
    if crew_role_violations:
        print(f"\n❌ Found {len(crew_role_violations)} crew role requirement violations:\n")
        for v in crew_role_violations:
            crew_name = next((c['name'] for c in input_data['crew'] if c['id'] == v['crewId']), v['crewId'])
            print(f"  {crew_name:<25s} {v['role']:<15s} Required: {v['required_hours']:.1f}h, Actual: {v['actual_hours']:.1f}h, Short: {v['shortage_hours']:.1f}h")
    else:
        print("\n✅ All crew role requirements met!")
    
    # Check 3: Coverage Windows
    print("\n" + "="*80)
    print("CONSTRAINT CHECK 3: COVERAGE WINDOWS")
    print("="*80)
    coverage_violations = check_coverage_windows(assignments, input_data['coverageWindows'])
    if coverage_violations:
        print(f"\n❌ Found {len(coverage_violations)} coverage window violations:\n")
        for v in coverage_violations:
            print(f"  {v['role']:<15s} Hour {v['hour']:2d}:00 - Required: {v['required']}, Actual: {v['actual']}, Short: {v['shortage']}")
    else:
        print("\n✅ All coverage windows met!")
    
    # Check 4: Break Requirements
    print("\n" + "="*80)
    print("CONSTRAINT CHECK 4: BREAK REQUIREMENTS")
    print("="*80)
    break_violations = []
    for crew_member in input_data['crew']:
        analysis = analyze_crew_schedule(crew_member['id'], assignments, input_data)
        if analysis.get('break_violation'):
            break_violations.append({
                'name': analysis['name'],
                'shift_hours': analysis['shift_minutes'] / 60,
                'has_break': analysis['has_break']
            })
    
    if break_violations:
        print(f"\n❌ Found {len(break_violations)} break requirement violations:\n")
        for v in break_violations:
            print(f"  {v['name']:<25s} Shift: {v['shift_hours']:.1f}h, Has Break: {v['has_break']}")
    else:
        print("\n✅ All break requirements met!")
    
    # Check 5: Schedule Gaps
    print("\n" + "="*80)
    print("CONSTRAINT CHECK 5: SCHEDULE GAPS (SHOULD BE NO GAPS)")
    print("="*80)
    crew_with_gaps = []
    for crew_member in input_data['crew']:
        analysis = analyze_crew_schedule(crew_member['id'], assignments, input_data)
        if analysis.get('gaps'):
            crew_with_gaps.append({
                'name': analysis['name'],
                'gaps': analysis['gaps']
            })
    
    if crew_with_gaps:
        print(f"\n❌ Found gaps in {len(crew_with_gaps)} crew schedules:\n")
        for item in crew_with_gaps[:10]:  # Show first 10
            print(f"  {item['name']:<25s} {len(item['gaps'])} gap(s)")
            for gap in item['gaps'][:3]:  # Show first 3 gaps
                print(f"    Gap: {minutes_to_time(gap['gap_start'])} - {minutes_to_time(gap['gap_end'])} ({gap['gap_minutes']}m) after {gap['after']}")
    else:
        print("\n✅ No gaps found!")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    total_violations = len(hourly_violations) + len(crew_role_violations) + len(coverage_violations) + len(break_violations) + len(crew_with_gaps)
    
    if total_violations == 0:
        print("\n✅ ALL CONSTRAINTS SATISFIED!")
    else:
        print(f"\n❌ Total constraint violations: {total_violations}")
        print(f"   - Hourly requirements: {len(hourly_violations)}")
        print(f"   - Crew role requirements: {len(crew_role_violations)}")
        print(f"   - Coverage windows: {len(coverage_violations)}")
        print(f"   - Break requirements: {len(break_violations)}")
        print(f"   - Schedule gaps: {len(crew_with_gaps)}")
    
    # Ask if user wants to see specific crew timelines
    print("\n" + "="*80)
    print("SAMPLE CREW TIMELINES")
    print("="*80)
    
    # Show a few sample crew members
    sample_crew = input_data['crew'][:3]
    for crew in sample_crew:
        print_crew_timeline(crew['id'], assignments, input_data)

if __name__ == '__main__':
    main()
