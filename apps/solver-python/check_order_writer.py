"""Check ORDER_WRITER hour requirements vs actual assignments."""

import json
from collections import defaultdict

# Load data
with open('solver_input_11_22_v5.json', 'r') as f:
    input_data = json.load(f)

with open('solver_output_11_22_v7.json', 'r') as f:
    output_data = json.load(f)

# Get required hours
required = {}
for req in input_data['crewRoleRequirements']:
    if req['role'] == 'ORDER_WRITER':
        required[req['crewId']] = req['requiredHours']

# Get actual hours from assignments
actual = defaultdict(float)
for assignment in output_data['assignments']:
    if assignment['taskType'] == 'ORDER_WRITER':
        crew_id = assignment['crewId']
        hours = (assignment['endTime'] - assignment['startTime']) / 60
        actual[crew_id] += hours

print("="*80)
print("ORDER_WRITER HOUR REQUIREMENTS vs ACTUAL")
print("="*80)
print()

# Get all crew with requirements or assignments
all_crew = set(required.keys()) | set(actual.keys())

violations = []
for crew_id in sorted(all_crew):
    req_hours = required.get(crew_id, 0)
    act_hours = actual.get(crew_id, 0)
    
    # Get crew name
    crew_info = next((c for c in input_data['crew'] if c['id'] == crew_id), None)
    crew_name = crew_info['name'] if crew_info else 'Unknown'
    
    status = "✅" if act_hours == req_hours else "❌"
    print(f"{status} {crew_id} ({crew_name:20s}): Required: {req_hours:4.1f}h, Actual: {act_hours:4.1f}h")
    
    if act_hours != req_hours:
        violations.append({
            'crew_id': crew_id,
            'name': crew_name,
            'required': req_hours,
            'actual': act_hours,
            'diff': act_hours - req_hours
        })

print()
print("="*80)
print("SUMMARY")
print("="*80)

if violations:
    print(f"\n❌ Found {len(violations)} violations:")
    print()
    for v in violations:
        if v['diff'] > 0:
            print(f"  OVER:  {v['crew_id']} ({v['name']:20s}): {v['actual']:4.1f}h assigned, {v['required']:4.1f}h required (+{v['diff']:4.1f}h)")
        else:
            print(f"  UNDER: {v['crew_id']} ({v['name']:20s}): {v['actual']:4.1f}h assigned, {v['required']:4.1f}h required ({v['diff']:4.1f}h)")
else:
    print("\n✅ All ORDER_WRITER hour requirements met exactly!")
