"""Check DEMO and WINE_DEMO coverage window compliance."""

import json
from collections import defaultdict

# Load data
import sys

if len(sys.argv) >= 3:
    input_file = sys.argv[1]
    output_file = sys.argv[2]
else:
    input_file = 'solver_input_11_22_v5.json'
    output_file = 'solver_output_11_22_v7.json'

with open(input_file, 'r') as f:
    input_data = json.load(f)

with open(output_file, 'r') as f:
    output_data = json.load(f)

# Get coverage requirements
coverage_windows = input_data['coverageWindows']

print("="*80)
print("DEMO & WINE_DEMO COVERAGE WINDOW ANALYSIS")
print("="*80)

for window in coverage_windows:
    role = window['role']
    start_hour = window['startHour']
    end_hour = window['endHour']
    required = window['requiredPerHour']
    
    print(f"\n{role}:")
    print(f"  Required: {required} crew per hour from {start_hour}:00 to {end_hour}:00")
    print(f"  Coverage window: {start_hour*60} - {end_hour*60} minutes")
    
    # Count assignments per 30-min slot
    slot_counts = defaultdict(int)
    
    for assignment in output_data['assignments']:
        if assignment['taskType'] == role:
            start_min = assignment['startTime']
            end_min = assignment['endTime']
            
            # Each 30-min slot
            for slot_min in range(start_min, end_min, 30):
                slot_counts[slot_min] += 1
    
    # Check each hour in the window
    violations = []
    for hour in range(start_hour, end_hour):
        hour_min = hour * 60
        
        # Check both 30-min slots in this hour
        slot1 = slot_counts.get(hour_min, 0)
        slot2 = slot_counts.get(hour_min + 30, 0)
        
        # Minimum coverage in this hour
        min_coverage = min(slot1, slot2)
        
        if min_coverage < required:
            violations.append({
                'hour': hour,
                'slot1': slot1,
                'slot2': slot2,
                'min': min_coverage,
                'required': required
            })
    
    if violations:
        print(f"\n  ❌ Found {len(violations)} hour(s) with insufficient coverage:")
        for v in violations:
            print(f"    Hour {v['hour']:2d}:00-{v['hour']+1:02d}:00 - Slot1: {v['slot1']}, Slot2: {v['slot2']}, Min: {v['min']}, Required: {v['required']}")
    else:
        print(f"\n  ✅ All hours have at least {required} crew!")
    
    # Show detailed breakdown
    print(f"\n  Detailed slot breakdown:")
    for hour in range(start_hour, end_hour):
        hour_min = hour * 60
        slot1 = slot_counts.get(hour_min, 0)
        slot2 = slot_counts.get(hour_min + 30, 0)
        status = "✅" if min(slot1, slot2) >= required else "❌"
        print(f"    {status} {hour:2d}:00-{hour:2d}:30: {slot1} crew | {hour:2d}:30-{hour+1:02d}:00: {slot2} crew")

# Check for assignments outside the coverage window
print("\n" + "="*80)
print("ASSIGNMENTS OUTSIDE COVERAGE WINDOWS")
print("="*80)

for window in coverage_windows:
    role = window['role']
    start_hour = window['startHour']
    end_hour = window['endHour']
    start_min = start_hour * 60
    end_min = end_hour * 60
    
    outside = [a for a in output_data['assignments'] 
               if a['taskType'] == role and (a['startTime'] < start_min or a['startTime'] >= end_min)]
    
    if outside:
        print(f"\n❌ {role} has {len(outside)} assignments outside {start_hour}:00-{end_hour}:00 window:")
        for a in outside:
            hour = a['startTime'] // 60
            minute = a['startTime'] % 60
            print(f"    Crew {a['crewId']} at {hour}:{minute:02d}")
    else:
        print(f"\n✅ {role}: All assignments within {start_hour}:00-{end_hour}:00 window")
