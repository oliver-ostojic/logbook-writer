#!/usr/bin/env python3
"""Debug script to trace variable creation for SOLVER roles."""
import json
import sys
import os

# Navigate to the correct directory and run from there
os.chdir(os.path.join(os.path.dirname(__file__), 'src/solver2/python'))
sys.path.insert(0, '.')

# Now we can use absolute imports within the package context
exec(open('__init__.py').read() if os.path.exists('__init__.py') else '')

from collections import defaultdict
from typing import List, Dict, Any
from ortools.sat.python import cp_model

# Import from modules directly (they use relative imports internally so we need to handle this)
import time_grid as tg
TimeGrid = tg.TimeGrid

# Read variables.py and execute relevant parts
with open('variables.py') as f:
    variables_code = f.read()


# Load input
with open('solver_input_v2_768_2025-11-25.json') as f:
    solver_input = json.load(f)

# Build time grid
grid = TimeGrid(solver_input)

# Get PRODUCT role (id 33)
roles = solver_input.get("roles", [])
crews = solver_input.get("crew", [])
prod_role = next((r for r in roles if r["id"] == 33), None)

if not prod_role:
    print("PRODUCT role not found!")
    sys.exit(1)

print(f"PRODUCT role config:")
print(f"  assignmentModels: {prod_role.get('assignmentModels')}")
print(f"  minSlots: {prod_role.get('minSlots')}")
print(f"  maxSlots: {prod_role.get('maxSlots')}")
print(f"  blockSize: {prod_role.get('blockSize')}")
print(f"  allowOutsideStoreHours: {prod_role.get('allowOutsideStoreHours')}")
print()

# Check eligible crews
min_shift_length = prod_role.get("minShiftLengthForRoleAccess") or 0
eligible_crews = _eligible_crews_for_role(prod_role, crews, grid, min_shift_length)
print(f"Eligible crews for PRODUCT role: {len(eligible_crews)}")

# Check slots for first few crews
total_slots = 0
crew_slot_counts = {}
for crew_id in eligible_crews[:5]:  # Sample first 5
    crew_window = grid.crew_windows.get(crew_id)
    if crew_window:
        block_size = max(1, int(prod_role.get("blockSize", 1) or 1))
        slots = _eligible_slots_for_role_and_crew(prod_role, crew_window, grid, block_size)
        crew_slot_counts[crew_id] = len(slots)
        print(f"  {crew_id}: {len(slots)} slots (shift: {crew_window.start_minute}-{crew_window.end_minute})")
    else:
        print(f"  {crew_id}: NO SHIFT WINDOW")

# Now build all variables and check
model = cp_model.CpModel()
bundle = build_assignment_variables(model, solver_input, grid)

# Check what we got for PRODUCT role
prod_vars = [v for v in bundle.slot_variables.values() if v.role_id == 33]
print(f"\nVariables created for PRODUCT role: {len(prod_vars)}")

# Check the summary
print(f"\nVariable summary: {bundle.summary()}")

# Check role_slot_counts from metadata
role_slot_counts = bundle.metadata.get("role_slot_counts", {})
print(f"\nSlots per role from metadata:")
for role_id, count in role_slot_counts.items():
    role = next((r for r in roles if r["id"] == role_id), None)
    name = role.get("displayName", str(role_id)) if role else str(role_id)
    assignment_models = role.get("assignmentModels", []) if role else []
    print(f"  {name} (id={role_id}): {count} slots, models={assignment_models}")
