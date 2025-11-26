#!/usr/bin/env python3
"""
Detailed role hours analysis - verify min/max slots for every crew member
"""

import json
from collections import defaultdict

def load_json(filename: str) -> dict:
    with open(filename, 'r') as f:
        return json.load(f)

def minutes_to_time(minutes: int) -> str:
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"

def main():
    output = load_json('solver_output_11_22_test.json')
    input_data = load_json('solver_input_11_22_unwrapped.json')
    
    assignments = output['assignments']
    slot_minutes = input_data['baseSlotMinutes']
    
    # Build role metadata map
    role_meta = {r['role']: r for r in input_data['roleMetadata']}
    
    print("="*100)
    print("ROLE HOURS ANALYSIS - VERIFY MIN/MAX SLOTS FOR EVERY CREW MEMBER")
    print("="*100)
    
    # Analyze each crew member
    violations = []
    
    for crew in input_data['crew']:
        crew_id = crew['id']
        crew_name = crew['name']
        
        # Count slots per role for this crew
        role_slots = defaultdict(int)
        for a in assignments:
            if a['crewId'] == crew_id:
                role_slots[a['taskType']] += 1
        
        # Check each role they were assigned
        has_violation = False
        role_details = []
        
        for role, slot_count in sorted(role_slots.items()):
            hours = (slot_count * slot_minutes) / 60
            meta = role_meta.get(role, {})
            min_slots = meta.get('minSlots', 0)
            max_slots = meta.get('maxSlots', 999)
            
            status = "✅"
            violation_msg = ""
            
            # Check min/max
            if slot_count < min_slots:
                status = "❌"
                violation_msg = f"UNDER MIN (need {min_slots})"
                has_violation = True
                violations.append({
                    'crew': crew_name,
                    'role': role,
                    'actual_slots': slot_count,
                    'min_slots': min_slots,
                    'max_slots': max_slots,
                    'violation': 'UNDER_MIN'
                })
            elif slot_count > max_slots:
                status = "❌"
                violation_msg = f"OVER MAX (limit {max_slots})"
                has_violation = True
                violations.append({
                    'crew': crew_name,
                    'role': role,
                    'actual_slots': slot_count,
                    'min_slots': min_slots,
                    'max_slots': max_slots,
                    'violation': 'OVER_MAX'
                })
            
            role_details.append({
                'role': role,
                'slots': slot_count,
                'hours': hours,
                'min': min_slots,
                'max': max_slots,
                'status': status,
                'violation': violation_msg
            })
        
        # Print crew summary
        if has_violation or len(role_slots) > 0:
            print(f"\n{crew_name} ({crew_id})")
            print(f"  Shift: {minutes_to_time(crew['shiftStartMin'])} - {minutes_to_time(crew['shiftEndMin'])}")
            for detail in role_details:
                violation_str = f" - {detail['violation']}" if detail['violation'] else ""
                print(f"  {detail['status']} {detail['role']:<15s} {detail['slots']:2d} slots ({detail['hours']:.1f}h)  [min:{detail['min']}, max:{detail['max']}]{violation_str}")
    
    # Check ORDER_WRITER requirements
    print("\n" + "="*100)
    print("ORDER_WRITER CREW-SPECIFIC REQUIREMENTS CHECK")
    print("="*100)
    
    ow_violations = []
    for req in input_data.get('crewRoleRequirements', []):
        if req['role'] == 'ORDER_WRITER':
            crew_id = req['crewId']
            required_hours = req['requiredHours']
            required_slots = required_hours * (60 // slot_minutes)
            
            crew_name = next((c['name'] for c in input_data['crew'] if c['id'] == crew_id), crew_id)
            
            # Count actual slots
            actual_slots = sum(1 for a in assignments if a['crewId'] == crew_id and a['taskType'] == 'ORDER_WRITER')
            actual_hours = (actual_slots * slot_minutes) / 60
            
            status = "✅" if actual_slots == required_slots else "❌"
            if actual_slots != required_slots:
                ow_violations.append({
                    'crew': crew_name,
                    'required_hours': required_hours,
                    'actual_hours': actual_hours
                })
            
            print(f"{status} {crew_name:<30s} Required: {required_hours}h ({required_slots} slots), Actual: {actual_hours}h ({actual_slots} slots)")
    
    # Check DEMO/WINE_DEMO coverage windows
    print("\n" + "="*100)
    print("COVERAGE WINDOW REQUIREMENTS CHECK (DEMO, WINE_DEMO)")
    print("="*100)
    
    coverage_violations = []
    for window in input_data.get('coverageWindows', []):
        role = window['role']
        start_hour = window['startHour']
        end_hour = window['endHour']
        required = window['requiredPerHour']
        
        print(f"\n{role}: {start_hour}:00 - {end_hour}:00, Required: {required} crew per hour")
        
        for hour in range(start_hour, end_hour):
            hour_start = hour * 60
            hour_end = (hour + 1) * 60
            
            # Count unique crew in this hour for this role
            crew_in_hour = set()
            for a in assignments:
                if a['taskType'] == role and a['startTime'] < hour_end and a['endTime'] > hour_start:
                    crew_in_hour.add(a['crewId'])
            
            actual = len(crew_in_hour)
            status = "✅" if actual == required else "❌"
            
            if actual != required:
                coverage_violations.append({
                    'role': role,
                    'hour': hour,
                    'required': required,
                    'actual': actual
                })
            
            print(f"  {status} Hour {hour:2d}:00 - Required: {required}, Actual: {actual}")
    
    # Summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    
    total_violations = len(violations) + len(ow_violations) + len(coverage_violations)
    
    if total_violations == 0:
        print("\n✅ ALL ROLE SLOT CONSTRAINTS SATISFIED!")
        print("   - All crew members within min/max slot limits")
        print("   - All ORDER_WRITER requirements met")
        print("   - All coverage windows satisfied")
    else:
        print(f"\n❌ Found {total_violations} violations:")
        print(f"   - Role min/max violations: {len(violations)}")
        print(f"   - ORDER_WRITER requirement violations: {len(ow_violations)}")
        print(f"   - Coverage window violations: {len(coverage_violations)}")
        
        if violations:
            print(f"\nRole min/max violations:")
            for v in violations:
                print(f"  - {v['crew']}: {v['role']} has {v['actual_slots']} slots (min:{v['min_slots']}, max:{v['max_slots']}) - {v['violation']}")

if __name__ == '__main__':
    main()
