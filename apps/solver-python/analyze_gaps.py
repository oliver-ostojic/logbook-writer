#!/usr/bin/env python3
"""Analyze unassigned gaps and available variables for each slot."""

import json
import sys
from collections import defaultdict

# Add the solver module to path
sys.path.insert(0, '/Users/oliver-ostojic/Desktop/logbook-writer/apps/solver-python')

from logbook_solver_v2.solver_v2 import SolverV2
from ortools.sat.python import cp_model


def analyze_gaps():
    # Load the solver input
    input_path = '/Users/oliver-ostojic/Desktop/logbook-writer/apps/api/solver_input_v2_768_2025-11-25.json'
    
    with open(input_path, 'r') as f:
        payload = json.load(f)
    
    print("="*80)
    print("GAP ANALYSIS: Finding unassigned slots and available variables")
    print("="*80)
    
    # Create solver instance (this builds all variables and constraints)
    solver = SolverV2(payload)
    
    # Solve it
    cp_solver = cp_model.CpSolver()
    cp_solver.parameters.max_time_in_seconds = 60
    status = cp_solver.Solve(solver.model)
    
    status_names = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE", 
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN"
    }
    print(f"\nSolver status: {status_names.get(status, status)}")
    
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("Solver did not find a solution - cannot analyze gaps")
        return
    
    # Build crew info
    crew_by_id = {c['id']: c for c in solver.crew}
    role_by_id = {r['id']: r for r in solver.roles}
    slot_minutes = solver.time_grid.slot_minutes
    
    # Collect all assignments
    assignments_by_crew = defaultdict(list)  # crew_id -> [(start_slot, end_slot, role_code)]
    
    for (crew_id, slot, role_id, task_slots), var in solver.assignment_vars.items():
        if cp_solver.Value(var):
            role = role_by_id.get(role_id, {})
            role_code = role.get('code', str(role_id))
            assignments_by_crew[crew_id].append((slot, slot + task_slots, role_code, task_slots))
    
    # Build variable index: which variables can START at each (crew, slot)?
    vars_starting_at = defaultdict(list)  # (crew_id, slot) -> [(role_code, task_slots, var)]
    vars_covering = defaultdict(list)  # (crew_id, slot) -> [(role_code, task_slots, start_slot, var)]
    
    for (crew_id, start_slot, role_id, task_slots), var in solver.assignment_vars.items():
        role = role_by_id.get(role_id, {})
        role_code = role.get('code', str(role_id))
        vars_starting_at[(crew_id, start_slot)].append((role_code, task_slots, var))
        
        # Track which slots this variable covers
        for s in range(start_slot, start_slot + task_slots):
            vars_covering[(crew_id, s)].append((role_code, task_slots, start_slot, var))
    
    # Analyze each crew
    print("\n" + "="*80)
    print("CREW-BY-CREW GAP ANALYSIS")
    print("="*80)
    
    total_gaps = 0
    gaps_with_no_vars = 0
    gaps_with_vars = 0
    
    gap_details = []
    
    for crew in solver.crew:
        crew_id = crew['id']
        crew_name = crew.get('name', crew_id)
        shift_start = crew['shiftStartMin']
        shift_end = crew['shiftEndMin']
        shift_start_slot = solver.time_grid.minutes_to_slot_floor(shift_start)
        shift_end_slot = solver.time_grid.minutes_to_slot_floor(shift_end)
        
        # Get assignments for this crew, sorted
        crew_assignments = sorted(assignments_by_crew.get(crew_id, []), key=lambda x: x[0])
        
        # Find gaps
        covered_slots = set()
        for start_slot, end_slot, role_code, task_slots in crew_assignments:
            for s in range(start_slot, end_slot):
                covered_slots.add(s)
        
        # Find unassigned slots
        unassigned_slots = []
        for slot in range(shift_start_slot, shift_end_slot):
            if slot not in covered_slots:
                unassigned_slots.append(slot)
        
        if not unassigned_slots:
            continue
        
        # Group consecutive unassigned slots into gaps
        gaps = []
        current_gap_start = unassigned_slots[0]
        current_gap_end = unassigned_slots[0]
        
        for slot in unassigned_slots[1:]:
            if slot == current_gap_end + 1:
                current_gap_end = slot
            else:
                gaps.append((current_gap_start, current_gap_end + 1))
                current_gap_start = slot
                current_gap_end = slot
        gaps.append((current_gap_start, current_gap_end + 1))
        
        # Analyze each gap
        for gap_start, gap_end in gaps:
            total_gaps += 1
            gap_slots = gap_end - gap_start
            gap_start_min = gap_start * slot_minutes
            gap_end_min = gap_end * slot_minutes
            
            # Find variables that could cover slots in this gap
            available_vars_for_gap = []
            
            for slot in range(gap_start, gap_end):
                covering = vars_covering.get((crew_id, slot), [])
                for role_code, task_slots, start_slot, var in covering:
                    if not cp_solver.Value(var):  # Variable exists but wasn't chosen
                        available_vars_for_gap.append({
                            'slot': slot,
                            'role': role_code,
                            'task_slots': task_slots,
                            'start_slot': start_slot,
                            'start_min': start_slot * slot_minutes,
                            'end_min': (start_slot + task_slots) * slot_minutes
                        })
            
            # Deduplicate by (start_slot, role, task_slots)
            seen = set()
            unique_vars = []
            for v in available_vars_for_gap:
                key = (v['start_slot'], v['role'], v['task_slots'])
                if key not in seen:
                    seen.add(key)
                    unique_vars.append(v)
            
            if not unique_vars:
                gaps_with_no_vars += 1
            else:
                gaps_with_vars += 1
            
            gap_details.append({
                'crew_name': crew_name,
                'crew_id': crew_id,
                'gap_start_min': gap_start_min,
                'gap_end_min': gap_end_min,
                'gap_slots': gap_slots,
                'gap_duration_min': gap_slots * slot_minutes,
                'available_vars': unique_vars,
                'has_vars': len(unique_vars) > 0
            })
    
    # Print summary
    print(f"\nSUMMARY:")
    print(f"  Total gaps found: {total_gaps}")
    print(f"  Gaps with NO variables available: {gaps_with_no_vars}")
    print(f"  Gaps WITH variables available (solver chose not to use): {gaps_with_vars}")
    
    # Print details
    print("\n" + "="*80)
    print("GAPS WITH NO VARIABLES (truly infeasible):")
    print("="*80)
    
    no_var_gaps = [g for g in gap_details if not g['has_vars']]
    for gap in no_var_gaps[:20]:  # Show first 20
        print(f"\n  {gap['crew_name']} ({gap['crew_id']}):")
        print(f"    Gap: {gap['gap_start_min']//60}:{gap['gap_start_min']%60:02d} - {gap['gap_end_min']//60}:{gap['gap_end_min']%60:02d}")
        print(f"    Duration: {gap['gap_duration_min']} min ({gap['gap_slots']} slots)")
        print(f"    Available variables: NONE")
    
    if len(no_var_gaps) > 20:
        print(f"\n  ... and {len(no_var_gaps) - 20} more gaps with no variables")
    
    print("\n" + "="*80)
    print("GAPS WITH AVAILABLE VARIABLES (solver chose not to fill):")
    print("="*80)
    
    with_var_gaps = [g for g in gap_details if g['has_vars']]
    for gap in with_var_gaps[:20]:  # Show first 20
        print(f"\n  {gap['crew_name']} ({gap['crew_id']}):")
        print(f"    Gap: {gap['gap_start_min']//60}:{gap['gap_start_min']%60:02d} - {gap['gap_end_min']//60}:{gap['gap_end_min']%60:02d}")
        print(f"    Duration: {gap['gap_duration_min']} min ({gap['gap_slots']} slots)")
        print(f"    Available variables that could fill this gap:")
        for v in gap['available_vars'][:10]:
            print(f"      - {v['role']} ({v['task_slots']} slots): {v['start_min']//60}:{v['start_min']%60:02d} - {v['end_min']//60}:{v['end_min']%60:02d}")
        if len(gap['available_vars']) > 10:
            print(f"      ... and {len(gap['available_vars']) - 10} more options")
    
    if len(with_var_gaps) > 20:
        print(f"\n  ... and {len(with_var_gaps) - 20} more gaps with available variables")
    
    # Check total assignment count
    total_assignments = sum(1 for (_, _, _, _), var in solver.assignment_vars.items() if cp_solver.Value(var))
    print(f"\n\nTotal assignments made: {total_assignments}")
    print(f"Total crew: {len(solver.crew)}")


if __name__ == '__main__':
    analyze_gaps()
