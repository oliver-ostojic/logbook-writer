"""Debug script to check if decision variables are being created correctly."""

import json
from logbook_solver.core import LogbookSolver

# Load the input
with open('solver_input_11_22_v5.json', 'r') as f:
    data = json.load(f)

# Create solver
solver = LogbookSolver(data)

# Check crew 1289526, slot 10 (300min), PARKING_HELM
crew_id = '1289526'
slot = 10  # 300min / 30min
role = 'PARKING_HELM'

key = (crew_id, slot, role)

print(f"Checking key: {key}")
print(f"Key exists in solver.x: {key in solver.x}")

# Check store hours
print(f"\nStore hours: {solver.open_minutes}-{solver.close_minutes} ({solver.open_minutes//60}:00-{solver.close_minutes//60}:00)")
print(f"Slot {slot} time: {slot * 30}min ({slot * 30 // 60}:{slot * 30 % 60:02d})")
print(f"Slot inside store hours: {solver._slot_inside_store_hours(slot)}")

# Check role metadata
print(f"\nPARKING_HELM metadata:")
meta = solver.role_meta_map.get('PARKING_HELM', {})
print(f"  isUniversal: {meta.get('isUniversal')}")
print(f"  allowOutsideStoreHours: {meta.get('allowOutsideStoreHours')}")
print(f"  _is_universal_role: {solver._is_universal_role('PARKING_HELM')}")
print(f"  _role_allows_outside_hours: {solver._role_allows_outside_hours('PARKING_HELM')}")

# Check crew
crew = solver.crew_by_id[crew_id]
print(f"\nCrew {crew_id}:")
print(f"  Shift: {crew['shiftStartMin']}-{crew['shiftEndMin']} ({crew['shiftStartMin']//60}:{crew['shiftStartMin']%60:02d}-{crew['shiftEndMin']//60}:{crew['shiftEndMin']%60:02d})")
print(f"  Shift slots: {crew['shiftStartMin']//30}-{crew['shiftEndMin']//30}")

# Check if variable should be created
shift_start_slot = crew['shiftStartMin'] // 30
shift_end_slot = crew['shiftEndMin'] // 30
inside_store_hours = solver._slot_inside_store_hours(slot)
is_universal = solver._is_universal_role(role)
allows_outside = solver._role_allows_outside_hours(role)

print(f"\nVariable creation logic for slot {slot}:")
print(f"  Slot in shift range [{shift_start_slot}, {shift_end_slot}): {shift_start_slot <= slot < shift_end_slot}")
print(f"  inside_store_hours: {inside_store_hours}")
print(f"  is_universal: {is_universal}")
print(f"  allows_outside_hours: {allows_outside}")
print(f"  Should skip due to store hours: {not inside_store_hours and not allows_outside}")
print(f"  Expected variable creation: {shift_start_slot <= slot < shift_end_slot and is_universal and not (not inside_store_hours and not allows_outside)}")

# Count all PARKING_HELM variables outside store hours
count_outside = 0
for key in solver.x:
    if key[2] == 'PARKING_HELM':
        slot_time = key[1] * 30
        if slot_time < 480 or slot_time >= 1260:
            count_outside += 1

print(f"\nTotal PARKING_HELM variables created outside store hours: {count_outside}")
