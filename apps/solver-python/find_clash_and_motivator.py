#!/usr/bin/env python3
"""
1) Find which constraint clashes with == 1
2) Test alternative motivator approach
"""

import json
import sys
from collections import defaultdict

sys.path.insert(0, '/Users/oliver-ostojic/Desktop/logbook-writer/apps/solver-python')

from logbook_solver_v2.time_grid import TimeGrid
from logbook_solver_v2.variables import VariableBuilder
from logbook_solver_v2.normalizer import normalize_payload
from ortools.sat.python import cp_model


def load_and_prepare():
    input_path = '/Users/oliver-ostojic/Desktop/logbook-writer/apps/api/solver_input_v2_768_2025-11-25.json'
    
    with open(input_path, 'r') as f:
        payload = json.load(f)
    
    payload = normalize_payload(payload)
    
    task_lengths = [role.get('taskLength', 30) for role in payload['roles'] if role.get('taskLength')]
    store = payload['store']
    
    time_grid = TimeGrid.from_store(
        open_minutes=store.get('openMinutesFromMidnight', 0),
        close_minutes=store.get('closeMinutesFromMidnight', 24 * 60),
        task_lengths=task_lengths,
    )
    
    return payload, time_grid


def build_vars(model, payload, time_grid):
    """Build variables without the debug output."""
    # Temporarily suppress stderr
    import io
    old_stderr = sys.stderr
    sys.stderr = io.StringIO()
    
    builder = VariableBuilder(model, time_grid)
    assignment_vars = builder.build(crew_records=payload['crew'], role_records=payload['roles'])
    
    sys.stderr = old_stderr
    return assignment_vars


def add_one_per_slot_constraint(model, payload, time_grid, assignment_vars):
    """Add == 1 constraint for each crew-slot."""
    for crew in payload['crew']:
        crew_id = crew['id']
        shift_start_slot = time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
        shift_end_slot = time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
        
        for slot in range(shift_start_slot, shift_end_slot):
            covering_vars = []
            for (var_crew_id, var_slot, role_id, task_slots), var in assignment_vars.items():
                if var_crew_id != crew_id:
                    continue
                if var_slot <= slot < var_slot + task_slots:
                    covering_vars.append(var)
            
            if covering_vars:
                model.Add(sum(covering_vars) == 1)


def add_coverage_window_constraints(model, payload, time_grid, assignment_vars):
    """Add coverage window constraints."""
    coverage_windows = payload.get('coverageWindows', [])
    if not coverage_windows:
        return 0
    
    slot_minutes = time_grid.slot_minutes
    role_by_id = {role['id']: role for role in payload['roles']}
    
    vars_by_role = defaultdict(list)
    for (crew_id, slot, role_id, task_slots), var in assignment_vars.items():
        vars_by_role[role_id].append((slot, task_slots, crew_id, var))
    
    constraints_added = 0
    for window in coverage_windows:
        role_id = window['roleId']
        start_min = window['startMin']
        end_min = window['endMin']
        # Support both old (crewPerTaskLength) and new (crewPerMinute) field names
        crew_per_task = int(window.get('crewPerMinute', window.get('crewPerTaskLength', 1)) or 1)
        
        if crew_per_task <= 0:
            continue
        
        role = role_by_id.get(role_id)
        if not role:
            continue
        
        task_length = role.get('taskLength', slot_minutes)
        task_slots = time_grid.task_length_to_slots(task_length)
        
        start_slot = time_grid.minutes_to_slot_floor(start_min)
        end_slot = time_grid.minutes_to_slot_floor(end_min)
        
        for task_start_slot in range(start_slot, end_slot, task_slots):
            task_end_slot = task_start_slot + task_slots
            if task_end_slot > end_slot:
                break
            
            covering_vars = []
            for (var_slot, var_task_slots, crew_id, var) in vars_by_role.get(role_id, []):
                var_end_slot = var_slot + var_task_slots
                if var_slot < task_end_slot and var_end_slot > task_start_slot:
                    covering_vars.append(var)
            
            if covering_vars:
                model.Add(sum(covering_vars) == crew_per_task)
                constraints_added += 1
    
    return constraints_added


def add_hourly_requirements(model, payload, time_grid, assignment_vars):
    """Add hourly requirements (legacy format)."""
    hourly_reqs = payload.get('hourlyRequirements', [])
    if not hourly_reqs:
        return 0
    
    slot_minutes = time_grid.slot_minutes
    role_by_id = {role['id']: role for role in payload['roles']}
    
    constraints_added = 0
    for req in hourly_reqs:
        role_id = req.get('roleId')
        hour = req.get('hour')
        required = req.get('required', 0)
        
        if not role_id or required <= 0:
            continue
        
        role = role_by_id.get(role_id)
        if not role:
            continue
        
        task_length = role.get('taskLength', slot_minutes)
        task_slots = time_grid.task_length_to_slots(task_length)
        
        # Hour to slot
        start_min = hour * 60
        start_slot = time_grid.minutes_to_slot_floor(start_min)
        end_slot = start_slot + (60 // slot_minutes)
        
        # Get variables covering this hour for this role
        covering_vars = []
        for (crew_id, var_slot, var_role_id, var_task_slots), var in assignment_vars.items():
            if var_role_id != role_id:
                continue
            var_end_slot = var_slot + var_task_slots
            # Check if variable covers any part of the hour
            if var_slot < end_slot and var_end_slot > start_slot:
                covering_vars.append(var)
        
        if covering_vars:
            model.Add(sum(covering_vars) >= required)
            constraints_added += 1
    
    return constraints_added


def test_constraint_combinations():
    print("="*80)
    print("FINDING WHICH CONSTRAINT CLASHES WITH == 1")
    print("="*80)
    
    payload, time_grid = load_and_prepare()
    
    # Test 1: Just == 1 (baseline - should work)
    print("\n[Test 1] == 1 constraint ONLY")
    model1 = cp_model.CpModel()
    vars1 = build_vars(model1, payload, time_grid)
    add_one_per_slot_constraint(model1, payload, time_grid, vars1)
    solver1 = cp_model.CpSolver()
    solver1.parameters.max_time_in_seconds = 30
    status1 = solver1.Solve(model1)
    print(f"   Status: {['UNKNOWN','MODEL_INVALID','FEASIBLE','INFEASIBLE','OPTIMAL'][status1]}")
    if status1 in (2, 4):  # FEASIBLE or OPTIMAL
        assignments1 = sum(1 for v in vars1.values() if solver1.Value(v))
        print(f"   Assignments: {assignments1}")
    
    # Test 2: == 1 + coverage windows
    print("\n[Test 2] == 1 + COVERAGE_WINDOWS")
    model2 = cp_model.CpModel()
    vars2 = build_vars(model2, payload, time_grid)
    add_one_per_slot_constraint(model2, payload, time_grid, vars2)
    cw_count = add_coverage_window_constraints(model2, payload, time_grid, vars2)
    print(f"   Coverage window constraints: {cw_count}")
    solver2 = cp_model.CpSolver()
    solver2.parameters.max_time_in_seconds = 30
    status2 = solver2.Solve(model2)
    print(f"   Status: {['UNKNOWN','MODEL_INVALID','FEASIBLE','INFEASIBLE','OPTIMAL'][status2]}")
    if status2 in (2, 4):
        assignments2 = sum(1 for v in vars2.values() if solver2.Value(v))
        print(f"   Assignments: {assignments2}")
    
    # Test 3: == 1 + hourly requirements
    print("\n[Test 3] == 1 + HOURLY_REQUIREMENTS")
    model3 = cp_model.CpModel()
    vars3 = build_vars(model3, payload, time_grid)
    add_one_per_slot_constraint(model3, payload, time_grid, vars3)
    hr_count = add_hourly_requirements(model3, payload, time_grid, vars3)
    print(f"   Hourly requirement constraints: {hr_count}")
    solver3 = cp_model.CpSolver()
    solver3.parameters.max_time_in_seconds = 30
    status3 = solver3.Solve(model3)
    print(f"   Status: {['UNKNOWN','MODEL_INVALID','FEASIBLE','INFEASIBLE','OPTIMAL'][status3]}")
    if status3 in (2, 4):
        assignments3 = sum(1 for v in vars3.values() if solver3.Value(v))
        print(f"   Assignments: {assignments3}")
    
    # Check what constraints exist in the payload
    print("\n" + "="*80)
    print("PAYLOAD CONSTRAINT DATA:")
    print("="*80)
    print(f"  coverageWindows: {len(payload.get('coverageWindows', []))}")
    print(f"  crewQuotas: {len(payload.get('crewQuotas', []))}")
    print(f"  roleFamilies: {len(payload.get('roleFamilies', []))}")
    print(f"  hourlyRequirements: {len(payload.get('hourlyRequirements', []))}")
    print(f"  windowRequirements: {len(payload.get('windowRequirements', []))}")
    print(f"  dailyRequirements: {len(payload.get('dailyRequirements', []))}")
    
    # Show sample hourly requirements
    hr = payload.get('hourlyRequirements', [])
    if hr:
        print(f"\n  Sample hourlyRequirements:")
        for r in hr[:5]:
            print(f"    {r}")


def test_soft_motivator():
    print("\n" + "="*80)
    print("TESTING SOFT MOTIVATOR APPROACH")
    print("="*80)
    print("Instead of hard == 1, add reward for each assignment in objective")
    
    payload, time_grid = load_and_prepare()
    
    model = cp_model.CpModel()
    assignment_vars = build_vars(model, payload, time_grid)
    
    # Add only <= 1 (no overlap, but gaps allowed)
    for crew in payload['crew']:
        crew_id = crew['id']
        shift_start_slot = time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
        shift_end_slot = time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
        
        for slot in range(shift_start_slot, shift_end_slot):
            covering_vars = []
            for (var_crew_id, var_slot, role_id, task_slots), var in assignment_vars.items():
                if var_crew_id != crew_id:
                    continue
                if var_slot <= slot < var_slot + task_slots:
                    covering_vars.append(var)
            
            if covering_vars:
                model.Add(sum(covering_vars) <= 1)
    
    # SOFT MOTIVATOR: Reward each assignment with a positive weight
    # Higher reward = more motivation to fill slots
    ASSIGNMENT_REWARD = 10
    
    reward_terms = []
    for var in assignment_vars.values():
        reward_terms.append(ASSIGNMENT_REWARD * var)
    
    model.Maximize(sum(reward_terms))
    
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60
    status = solver.Solve(model)
    
    print(f"\nStatus: {['UNKNOWN','MODEL_INVALID','FEASIBLE','INFEASIBLE','OPTIMAL'][status]}")
    
    if status in (2, 4):  # FEASIBLE or OPTIMAL
        assignments = sum(1 for v in assignment_vars.values() if solver.Value(v))
        print(f"Assignments made: {assignments}")
        print(f"Objective value: {solver.ObjectiveValue()}")
        
        # Count slots per crew
        slot_minutes = time_grid.slot_minutes
        crew_stats = defaultdict(lambda: {'assigned': 0, 'total': 0})
        
        for crew in payload['crew']:
            crew_id = crew['id']
            shift_start_slot = time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end_slot = time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            crew_stats[crew_id]['total'] = shift_end_slot - shift_start_slot
        
        for (crew_id, slot, role_id, task_slots), var in assignment_vars.items():
            if solver.Value(var):
                crew_stats[crew_id]['assigned'] += task_slots
        
        # Show coverage
        fully_covered = sum(1 for s in crew_stats.values() if s['assigned'] >= s['total'])
        partial = sum(1 for s in crew_stats.values() if 0 < s['assigned'] < s['total'])
        empty = sum(1 for s in crew_stats.values() if s['assigned'] == 0)
        
        print(f"\nCrew coverage:")
        print(f"  Fully covered: {fully_covered}")
        print(f"  Partially covered: {partial}")
        print(f"  Empty: {empty}")


if __name__ == '__main__':
    test_constraint_combinations()
    test_soft_motivator()
