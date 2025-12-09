"""Constraint hooks for SolverV2.

This module implements the new constraint system:
- RoleCoverageWindow: "N crew per taskLength between startMin-endMin"
- CrewRoleQuota: "this crew must do X minutes of this role"
- RoleFamily: aggregate min/max minutes per crew across related roles
"""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import TYPE_CHECKING, Dict, List, Tuple

if TYPE_CHECKING:  # pragma: no cover
    from .solver_v2 import SolverV2


def add_all(solver: "SolverV2") -> None:
    """Attach every hard constraint to the model."""
    print("\n" + "="*60, file=sys.stderr)
    print("CONSTRAINT DEBUGGING", file=sys.stderr)
    print("="*60, file=sys.stderr)
    
    _one_task_per_slot(solver)
    _coverage_window_constraints(solver)
    _no_assignments_outside_coverage_windows(solver)
    _crew_quota_constraints(solver)
    _role_family_constraints(solver)
    _consecutive_required_constraints(solver)
    
    print("="*60 + "\n", file=sys.stderr)


def _one_task_per_slot(solver: "SolverV2") -> None:
    """Each crew member can only do one task per slot.
    
    Since tasks can span multiple slots (taskLength), we need to ensure
    no overlapping assignments. For a task starting at slot S with length L,
    it occupies slots [S, S+L).
    """
    print("\n[1] ONE_TASK_PER_SLOT constraint:", file=sys.stderr)
    
    m = solver.model
    slot_minutes = solver.time_grid.slot_minutes
    
    constraints_added = 0
    slots_with_no_vars = []
    
    for crew in solver.crew:
        crew_id = crew['id']
        crew_name = crew.get('name', crew_id)
        shift_start_slot = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
        shift_end_slot = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])

        for slot in range(shift_start_slot, shift_end_slot):
            # Get all variables that COVER this slot (not just start at it)
            covering_vars = []
            
            for (var_crew_id, var_slot, role_id, task_slots), var in solver.assignment_vars.items():
                if var_crew_id != crew_id:
                    continue
                # Check if this variable's task covers the current slot
                # Task starts at var_slot and covers [var_slot, var_slot + task_slots)
                if var_slot <= slot < var_slot + task_slots:
                    covering_vars.append(var)
            
            if covering_vars:
                # Allow at most one task per slot (no overlapping)
                # The soft motivator in objective.py incentivizes filling all slots
                m.Add(sum(covering_vars) <= 1)
                constraints_added += 1
            else:
                slot_min = slot * slot_minutes
                slots_with_no_vars.append((crew_name, slot, slot_min))
    
    print(f"   Constraints added: {constraints_added}", file=sys.stderr)
    
    if slots_with_no_vars:
        print(f"   ⚠️  PROBLEM: {len(slots_with_no_vars)} crew-slots have NO variables!", file=sys.stderr)
        # Group by crew
        by_crew = defaultdict(list)
        for crew_name, slot, slot_min in slots_with_no_vars:
            by_crew[crew_name].append((slot, slot_min))
        
        for crew_name, slots in list(by_crew.items())[:5]:  # Show first 5 crew
            slot_info = ", ".join([f"slot {s} ({m}min)" for s, m in slots[:3]])
            if len(slots) > 3:
                slot_info += f" ... +{len(slots)-3} more"
            print(f"      - {crew_name}: {slot_info}", file=sys.stderr)
        if len(by_crew) > 5:
            print(f"      ... and {len(by_crew) - 5} more crew", file=sys.stderr)


def _coverage_window_constraints(solver: "SolverV2") -> None:
    """Build coverage window constraints.
    
    For each RoleCoverageWindow, ensure crewPerTaskLength people are assigned
    at each taskLength position within the window [startMin, endMin).
    """
    print("\n[2] COVERAGE_WINDOW constraints:", file=sys.stderr)
    
    if not solver.coverage_windows:
        print("   No coverage windows defined", file=sys.stderr)
        return

    m = solver.model
    slot_minutes = solver.time_grid.slot_minutes
    role_by_id = {role['id']: role for role in solver.roles}

    # Index variables by role for faster lookup
    vars_by_role: Dict[int, List[Tuple[int, int, int, object]]] = defaultdict(list)
    for (crew_id, slot, role_id, task_slots), var in solver.assignment_vars.items():
        vars_by_role[role_id].append((slot, task_slots, crew_id, var))

    print(f"   Coverage windows: {len(solver.coverage_windows)}", file=sys.stderr)
    print(f"   Variables by role: {[(rid, len(vs)) for rid, vs in vars_by_role.items()]}", file=sys.stderr)
    
    constraints_added = 0
    impossible_constraints = []

    for window in solver.coverage_windows:
        role_id = window['roleId']
        start_min = window['startMin']
        end_min = window['endMin']
        crew_per_task = int(window.get('crewPerTaskLength', 1) or 1)
        
        if crew_per_task <= 0:
            continue

        role = role_by_id.get(role_id)
        if not role:
            print(f"   ⚠️  Window references unknown role {role_id}", file=sys.stderr)
            continue
        
        task_length = role.get('taskLength', slot_minutes)
        task_slots = solver.time_grid.task_length_to_slots(task_length)
        
        # Convert window to slots
        start_slot = solver.time_grid.minutes_to_slot_floor(start_min)
        end_slot = solver.time_grid.minutes_to_slot_floor(end_min)
        
        # For each task-sized position in the window
        for task_start_slot in range(start_slot, end_slot, task_slots):
            task_end_slot = task_start_slot + task_slots
            if task_end_slot > end_slot:
                break
            
            # Get all variables that cover this task window
            # A variable covers if it starts within or overlaps this position
            covering_vars = []
            for (var_slot, var_task_slots, crew_id, var) in vars_by_role.get(role_id, []):
                var_end_slot = var_slot + var_task_slots
                # Check overlap: var covers [var_slot, var_end_slot), task is [task_start_slot, task_end_slot)
                if var_slot < task_end_slot and var_end_slot > task_start_slot:
                    covering_vars.append(var)
            
            if covering_vars:
                # Require exactly crew_per_task assignments covering this position
                m.Add(sum(covering_vars) == crew_per_task)
                constraints_added += 1
                
                if len(covering_vars) < crew_per_task:
                    impossible_constraints.append({
                        'role': role.get('code'),
                        'slot': task_start_slot,
                        'time': task_start_slot * slot_minutes,
                        'required': crew_per_task,
                        'available': len(covering_vars)
                    })
            else:
                impossible_constraints.append({
                    'role': role.get('code'),
                    'slot': task_start_slot,
                    'time': task_start_slot * slot_minutes,
                    'required': crew_per_task,
                    'available': 0
                })
    
    print(f"   Constraints added: {constraints_added}", file=sys.stderr)
    
    if impossible_constraints:
        print(f"   ⚠️  PROBLEM: {len(impossible_constraints)} positions have insufficient variables!", file=sys.stderr)
        for c in impossible_constraints[:10]:
            print(f"      - {c['role']} at slot {c['slot']} ({c['time']}min): need {c['required']}, have {c['available']}", file=sys.stderr)
        if len(impossible_constraints) > 10:
            print(f"      ... and {len(impossible_constraints) - 10} more", file=sys.stderr)


def _no_assignments_outside_coverage_windows(solver: "SolverV2") -> None:
    """Prevent assignments for roles outside their defined coverage windows.
    
    For roles that have coverage windows (HOURLY, HOURLY_OR_WINDOW, WINDOW assignment models),
    we forbid any assignment that starts outside those windows.
    
    This prevents issues like parking helms being assigned at 8am when their
    coverage window doesn't start until later.
    """
    print("\n[2b] NO_ASSIGNMENTS_OUTSIDE_WINDOWS constraint:", file=sys.stderr)
    
    if not solver.coverage_windows:
        print("   No coverage windows - skipping", file=sys.stderr)
        return
    
    m = solver.model
    slot_minutes = solver.time_grid.slot_minutes
    
    # Build a lookup: role_id -> list of (start_slot, end_slot) coverage windows
    role_windows: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
    for window in solver.coverage_windows:
        role_id = window['roleId']
        start_slot = solver.time_grid.minutes_to_slot_floor(window['startMin'])
        end_slot = solver.time_grid.minutes_to_slot_floor(window['endMin'])
        role_windows[role_id].append((start_slot, end_slot))
    
    # Find roles that HAVE coverage windows (these are restricted)
    roles_with_windows = set(role_windows.keys())
    
    if not roles_with_windows:
        print("   No roles with coverage windows - skipping", file=sys.stderr)
        return
    
    print(f"   Roles with coverage windows: {roles_with_windows}", file=sys.stderr)
    
    constraints_added = 0
    forbidden_vars = []
    
    for (crew_id, slot, role_id, task_slots), var in solver.assignment_vars.items():
        if role_id not in roles_with_windows:
            # This role has no coverage windows, so it's unrestricted
            continue
        
        # Check if this slot falls within ANY of the role's coverage windows
        windows = role_windows[role_id]
        slot_in_window = False
        
        for (win_start, win_end) in windows:
            # The assignment spans [slot, slot + task_slots)
            # It's valid if the entire assignment is within [win_start, win_end)
            if slot >= win_start and (slot + task_slots) <= win_end:
                slot_in_window = True
                break
        
        if not slot_in_window:
            # This variable is outside all coverage windows - forbid it
            m.Add(var == 0)
            constraints_added += 1
            forbidden_vars.append((crew_id, slot, role_id, task_slots))
    
    print(f"   Constraints added: {constraints_added}", file=sys.stderr)
    
    if forbidden_vars:
        print(f"   Forbade {len(forbidden_vars)} variables outside coverage windows", file=sys.stderr)
        # Show some examples
        for (crew_id, slot, role_id, task_slots) in forbidden_vars[:5]:
            role = next((r for r in solver.roles if r['id'] == role_id), None)
            role_code = role.get('code', role_id) if role else role_id
            time_min = slot * slot_minutes
            print(f"      - crew {crew_id}, {role_code} at slot {slot} ({time_min}min)", file=sys.stderr)
        if len(forbidden_vars) > 5:
            print(f"      ... and {len(forbidden_vars) - 5} more", file=sys.stderr)


def _crew_quota_constraints(solver: "SolverV2") -> None:
    """Build crew quota constraints.
    
    Each CrewRoleQuota specifies: this crew must have at least requiredMin 
    minutes of assignment for this role within [startMin, endMin).
    """
    print("\n[3] CREW_QUOTA constraints:", file=sys.stderr)
    
    if not solver.crew_quotas:
        print("   No crew quotas defined", file=sys.stderr)
        return

    m = solver.model
    slot_minutes = solver.time_grid.slot_minutes

    # Index variables by (crew, role)
    vars_by_crew_role: Dict[Tuple[str, int], List[Tuple[int, int, object]]] = defaultdict(list)
    for (crew_id, slot, role_id, task_slots), var in solver.assignment_vars.items():
        vars_by_crew_role[(crew_id, role_id)].append((slot, task_slots, var))

    print(f"   Crew quotas: {len(solver.crew_quotas)}", file=sys.stderr)
    
    constraints_added = 0
    impossible_quotas = []

    for quota in solver.crew_quotas:
        crew_id = quota['crewId']
        role_id = quota['roleId']
        required_min = int(quota.get('requiredMin', 0) or 0)
        start_min = quota.get('startMin', 0)
        end_min = quota.get('endMin', 24 * 60)
        
        if required_min <= 0:
            continue
        
        # Convert window to slots
        start_slot = solver.time_grid.minutes_to_slot_floor(start_min)
        end_slot = solver.time_grid.minutes_to_slot_floor(end_min)
        
        # Get variables for this crew+role within the time window
        matching_vars = []
        for (slot, task_slots, var) in vars_by_crew_role.get((crew_id, role_id), []):
            if start_slot <= slot < end_slot:
                # Weight by task duration in minutes
                task_minutes = task_slots * slot_minutes
                matching_vars.append((task_minutes, var))
        
        # Calculate max possible minutes from available vars
        max_possible = sum(minutes for minutes, var in matching_vars)
        
        if matching_vars:
            # Sum of (minutes * var) == required_min (EXACT match required)
            total_minutes = sum(minutes * var for minutes, var in matching_vars)
            m.Add(total_minutes == required_min)
            constraints_added += 1
            
            if max_possible < required_min:
                impossible_quotas.append({
                    'crewId': crew_id,
                    'roleId': role_id,
                    'required': required_min,
                    'maxPossible': max_possible,
                    'numVars': len(matching_vars)
                })
        else:
            if required_min > 0:
                impossible_quotas.append({
                    'crewId': crew_id,
                    'roleId': role_id,
                    'required': required_min,
                    'maxPossible': 0,
                    'numVars': 0
                })
    
    print(f"   Constraints added: {constraints_added}", file=sys.stderr)
    
    if impossible_quotas:
        print(f"   ⚠️  PROBLEM: {len(impossible_quotas)} quotas are impossible to satisfy!", file=sys.stderr)
        for q in impossible_quotas[:10]:
            print(f"      - crew {q['crewId']}, role {q['roleId']}: need {q['required']}min, max possible {q['maxPossible']}min ({q['numVars']} vars)", file=sys.stderr)
        if len(impossible_quotas) > 10:
            print(f"      ... and {len(impossible_quotas) - 10} more", file=sys.stderr)


def _role_family_constraints(solver: "SolverV2") -> None:
    """Build role family constraints.
    
    Each crew's total time across all roles in a family must be within
    [minMinutes, maxMinutes].
    """
    print("\n[4] ROLE_FAMILY constraints:", file=sys.stderr)
    
    if not solver.role_families:
        print("   No role families defined", file=sys.stderr)
        return

    m = solver.model
    slot_minutes = solver.time_grid.slot_minutes

    # Build family_id -> roles mapping (need full role info for minShiftLengthForRoleAccess)
    family_roles: Dict[int, List[dict]] = defaultdict(list)
    for role in solver.roles:
        family_id = role.get('familyId')
        if family_id:
            family_roles[family_id].append(role)

    # Build crew shift lengths lookup
    crew_shift_minutes: Dict[str, int] = {}
    for crew in solver.crew:
        shift_length = crew.get('shiftEndMin', 0) - crew.get('shiftStartMin', 0)
        crew_shift_minutes[crew['id']] = shift_length

    # Index variables by (crew, family)
    vars_by_crew_family: Dict[Tuple[str, int], List[Tuple[int, object]]] = defaultdict(list)
    for (crew_id, slot, role_id, task_slots), var in solver.assignment_vars.items():
        role = next((r for r in solver.roles if r['id'] == role_id), None)
        if role and role.get('familyId'):
            family_id = role['familyId']
            task_minutes = task_slots * slot_minutes
            vars_by_crew_family[(crew_id, family_id)].append((task_minutes, var))

    print(f"   Role families: {len(solver.role_families)}", file=sys.stderr)
    
    constraints_added = 0
    impossible_family = []

    for family in solver.role_families:
        family_id = family['id']
        family_name = family.get('name', f'family_{family_id}')
        min_minutes = family.get('minMinutes', 0)
        max_minutes = family.get('maxMinutes', 24 * 60)
        
        # Check if any role in this family has minShiftLengthForRoleAccess
        # If so, the min constraint only applies to crews meeting that threshold
        roles_in_family = family_roles.get(family_id, [])
        min_shift_required = None
        for role in roles_in_family:
            role_min_shift = role.get('minShiftLengthForRoleAccess')
            if role_min_shift is not None:
                if min_shift_required is None:
                    min_shift_required = role_min_shift
                else:
                    # Use the minimum across all roles in family
                    min_shift_required = min(min_shift_required, role_min_shift)
        
        # Apply to each crew that has variables in this family
        crew_ids = set(crew['id'] for crew in solver.crew)
        for crew_id in crew_ids:
            family_vars = vars_by_crew_family.get((crew_id, family_id), [])
            if not family_vars:
                continue
            
            crew_shift = crew_shift_minutes.get(crew_id, 0)
            max_possible = sum(minutes for minutes, var in family_vars)
            
            # Sum of (minutes * var)
            total_minutes = sum(minutes * var for minutes, var in family_vars)
            
            # Apply min constraint only if crew meets shift length requirement
            if min_minutes > 0:
                if min_shift_required is None or crew_shift >= min_shift_required:
                    m.Add(total_minutes >= min_minutes)
                    constraints_added += 1
                    
                    if max_possible < min_minutes:
                        impossible_family.append({
                            'crewId': crew_id,
                            'family': family_name,
                            'minRequired': min_minutes,
                            'maxPossible': max_possible
                        })
            
            # Max constraint always applies (if crew has variables, cap their time)
            if max_minutes < 24 * 60:
                m.Add(total_minutes <= max_minutes)
                constraints_added += 1
    
    print(f"   Constraints added: {constraints_added}", file=sys.stderr)
    
    if impossible_family:
        print(f"   ⚠️  PROBLEM: {len(impossible_family)} crew-family mins are impossible!", file=sys.stderr)
        for f in impossible_family[:10]:
            print(f"      - crew {f['crewId']}, {f['family']}: need {f['minRequired']}min, max possible {f['maxPossible']}min", file=sys.stderr)
        if len(impossible_family) > 10:
            print(f"      ... and {len(impossible_family) - 10} more", file=sys.stderr)


def _consecutive_required_constraints(solver: "SolverV2") -> None:
    """Enforce consecutive slots for roles with consecutivePolicy = REQUIRED.
    
    For each crew member and role with REQUIRED policy, if they are assigned
    at two non-adjacent slots, we prevent this by adding constraints that
    ensure no gaps exist in assignments.
    
    Logic: For any triplet of slots (S, S+1, S+2), if crew is assigned at S
    and at S+2, they MUST be assigned at S+1 too. This prevents holes.
    
    Implementation: For each consecutive triplet where middle slot is unassigned,
    add constraint: x_S + x_S+2 <= 1 (can't have both without middle)
    """
    print("\n[5] CONSECUTIVE_REQUIRED constraints:", file=sys.stderr)
    
    m = solver.model
    
    # Find roles with REQUIRED consecutive policy
    required_role_ids = set()
    for role in solver.roles:
        if role.get('consecutivePolicy') == 'REQUIRED':
            required_role_ids.add(role['id'])
    
    if not required_role_ids:
        print("   No roles with REQUIRED policy - skipping", file=sys.stderr)
        return
    
    print(f"   Roles with REQUIRED policy: {required_role_ids}", file=sys.stderr)
    
    constraints_added = 0
    
    # Group assignment vars by (crew_id, role_id) -> {slot: [vars]}
    vars_by_crew_role: Dict[Tuple[int, int], Dict[int, list]] = defaultdict(lambda: defaultdict(list))
    
    for key, var in solver.assignment_vars.items():
        crew_id, slot, role_id, task_slots = key
        if role_id in required_role_ids:
            vars_by_crew_role[(crew_id, role_id)][slot].append(var)
    
    # For each crew+role combo, ensure no gaps in assignments
    for (crew_id, role_id), slot_vars in vars_by_crew_role.items():
        sorted_slots = sorted(slot_vars.keys())
        
        # For each triplet (slot, slot+1, slot+2), ensure no gap
        for i in range(len(sorted_slots)):
            slot_i = sorted_slots[i]
            
            # Find slots that are 2 away (potential gap)
            for j in range(i + 1, len(sorted_slots)):
                slot_j = sorted_slots[j]
                
                if slot_j <= slot_i + 1:
                    continue  # Adjacent or same, no gap possible
                
                # slot_j is at least 2 slots after slot_i
                # Check if there's a middle slot that would be skipped
                middle_slot = slot_i + 1
                
                if middle_slot in slot_vars:
                    # Middle slot exists, so assignment there can prevent gap
                    # For REQUIRED: if assigned at both ends, must be assigned in middle
                    # This is: x_i + x_j - sum(x_middle) <= 1
                    # Rearranged: x_i + x_j <= 1 + sum(x_middle)
                    for var_i in slot_vars[slot_i]:
                        for var_j in slot_vars[slot_j]:
                            middle_vars = slot_vars[middle_slot]
                            m.Add(var_i + var_j <= 1 + sum(middle_vars))
                            constraints_added += 1
                else:
                    # No middle slot variable exists at all - prevent both ends
                    for var_i in slot_vars[slot_i]:
                        for var_j in slot_vars[slot_j]:
                            m.Add(var_i + var_j <= 1)
                            constraints_added += 1
                
                # Only check immediate next gap (slot_i -> slot_i+2)
                # Further gaps will be transitively handled
                break
    
    print(f"   Constraints added: {constraints_added}", file=sys.stderr)


__all__ = ["add_all"]
