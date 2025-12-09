#!/usr/bin/env python3
"""Debug why == 1 constraint causes infeasibility."""

import json
import sys
from collections import defaultdict

sys.path.insert(0, '/Users/oliver-ostojic/Desktop/logbook-writer/apps/solver-python')

from logbook_solver_v2.solver_v2 import SolverV2
from logbook_solver_v2.time_grid import TimeGrid
from logbook_solver_v2.variables import VariableBuilder
from logbook_solver_v2.normalizer import normalize_payload
from ortools.sat.python import cp_model


def debug_infeasibility():
    input_path = '/Users/oliver-ostojic/Desktop/logbook-writer/apps/api/solver_input_v2_768_2025-11-25.json'
    
    with open(input_path, 'r') as f:
        payload = json.load(f)
    
    payload = normalize_payload(payload)
    
    print("="*80)
    print("DEBUGGING INFEASIBILITY WITH == 1 CONSTRAINT")
    print("="*80)
    
    # Build time grid and variables manually
    task_lengths = [role.get('taskLength', 30) for role in payload['roles'] if role.get('taskLength')]
    store = payload['store']
    
    time_grid = TimeGrid.from_store(
        open_minutes=store.get('openMinutesFromMidnight', 0),
        close_minutes=store.get('closeMinutesFromMidnight', 24 * 60),
        task_lengths=task_lengths,
    )
    
    model = cp_model.CpModel()
    builder = VariableBuilder(model, time_grid)
    assignment_vars = builder.build(crew_records=payload['crew'], role_records=payload['roles'])
    
    print(f"\nTotal variables created: {len(assignment_vars)}")
    print(f"Total crew: {len(payload['crew'])}")
    
    slot_minutes = time_grid.slot_minutes
    role_by_id = {r['id']: r for r in payload['roles']}
    
    # Add ONLY the == 1 constraint (no other constraints)
    print("\nAdding == 1 constraints...")
    
    constraints_added = 0
    problematic_slots = []
    
    for crew in payload['crew']:
        crew_id = crew['id']
        crew_name = crew.get('name', crew_id)
        shift_start_slot = time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
        shift_end_slot = time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
        
        for slot in range(shift_start_slot, shift_end_slot):
            # Get all variables that COVER this slot
            covering_vars = []
            covering_info = []
            
            for (var_crew_id, var_slot, role_id, task_slots), var in assignment_vars.items():
                if var_crew_id != crew_id:
                    continue
                # Check if this variable's task covers the current slot
                if var_slot <= slot < var_slot + task_slots:
                    covering_vars.append(var)
                    role = role_by_id.get(role_id, {})
                    covering_info.append({
                        'role': role.get('code', str(role_id)),
                        'start_slot': var_slot,
                        'task_slots': task_slots,
                        'start_min': var_slot * slot_minutes,
                        'end_min': (var_slot + task_slots) * slot_minutes
                    })
            
            if covering_vars:
                model.Add(sum(covering_vars) == 1)
                constraints_added += 1
            else:
                slot_min = slot * slot_minutes
                problematic_slots.append({
                    'crew_name': crew_name,
                    'crew_id': crew_id,
                    'slot': slot,
                    'slot_min': slot_min,
                    'shift_start': crew['shiftStartMin'],
                    'shift_end': crew['shiftEndMin']
                })
    
    print(f"Constraints added: {constraints_added}")
    print(f"Slots with NO covering variables: {len(problematic_slots)}")
    
    if problematic_slots:
        print("\n⚠️ PROBLEMATIC SLOTS (no variables can cover them):")
        for p in problematic_slots[:20]:
            print(f"  {p['crew_name']}: slot {p['slot']} ({p['slot_min']} min = {p['slot_min']//60}:{p['slot_min']%60:02d})")
            print(f"    Shift: {p['shift_start']}-{p['shift_end']} min")
    
    # Now solve with ONLY == 1 constraints
    print("\n" + "="*80)
    print("SOLVING WITH ONLY == 1 CONSTRAINTS (no coverage windows, no quotas)")
    print("="*80)
    
    # No objective - just checking feasibility
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    
    status = solver.Solve(model)
    
    status_names = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN"
    }
    print(f"\nStatus: {status_names.get(status, status)}")
    
    if status == cp_model.INFEASIBLE:
        print("\n❌ INFEASIBLE - Let's try to find why...")
        
        # Try solving for each crew individually
        print("\nTesting each crew individually...")
        infeasible_crew = []
        
        for crew in payload['crew']:
            crew_id = crew['id']
            crew_name = crew.get('name', crew_id)
            
            # Build a mini model for just this crew
            mini_model = cp_model.CpModel()
            
            # Get variables for this crew
            crew_vars = {k: mini_model.NewBoolVar(f"x_{k}") 
                        for k in assignment_vars.keys() if k[0] == crew_id}
            
            if not crew_vars:
                continue
            
            shift_start_slot = time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end_slot = time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            for slot in range(shift_start_slot, shift_end_slot):
                covering_vars = []
                for (var_crew_id, var_slot, role_id, task_slots), var in crew_vars.items():
                    if var_slot <= slot < var_slot + task_slots:
                        covering_vars.append(var)
                
                if covering_vars:
                    mini_model.Add(sum(covering_vars) == 1)
            
            mini_solver = cp_model.CpSolver()
            mini_solver.parameters.max_time_in_seconds = 5
            mini_status = mini_solver.Solve(mini_model)
            
            if mini_status == cp_model.INFEASIBLE:
                infeasible_crew.append(crew_name)
        
        if infeasible_crew:
            print(f"\n❌ Individual crew that are INFEASIBLE on their own:")
            for name in infeasible_crew[:20]:
                print(f"  - {name}")
            if len(infeasible_crew) > 20:
                print(f"  ... and {len(infeasible_crew) - 20} more")
        else:
            print("\n✅ All individual crew are feasible on their own!")
            print("   The infeasibility must come from INTERACTIONS between crew")
            print("   (e.g., coverage windows requiring multiple crew at same time)")
    
    elif status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("\n✅ FEASIBLE with just == 1 constraints!")
        
        # Count assignments
        total = sum(1 for var in assignment_vars.values() if solver.Value(var))
        print(f"Total assignments: {total}")


if __name__ == '__main__':
    debug_infeasibility()
