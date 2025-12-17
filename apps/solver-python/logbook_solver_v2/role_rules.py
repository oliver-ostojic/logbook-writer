"""Role Rules constraint implementations for SolverV2.

This module handles the RoleRule constraints defined in the database.
All valueInt fields are in minutes (except -1/0/1 for TIMING, DISTRIBUTION).

Implemented:
- FORBID_ROLE: prevent crew from being assigned a role
- MIN_CONSECUTIVE_MINUTES: minimum consecutive minutes on a role
- MAX_CONSECUTIVE_MINUTES: maximum consecutive minutes on a role
- CANNOT_BE_ASSIGNED_BEFORE: role X cannot be assigned before target role Y
- CANNOT_BE_ASSIGNED_AFTER: role X cannot be assigned after target role Y
- TIMING: prefer early (-1), indifferent (0), or late (1) assignments
- ASSIGN_BEFORE_SHIFT_MIN_X: must assign within first X minutes of shift
- ASSIGN_AFTER_SHIFT_MIN_X: must assign after X minutes into shift
- CANNOT_ASSIGN_DURING_STORE_HOUR_X: forbid role during specific hour (valueInt = hour in minutes from midnight)
"""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import TYPE_CHECKING, Dict, List

if TYPE_CHECKING:
    from .solver_v2 import SolverV2


def apply_role_rules(solver: "SolverV2") -> None:
    """Apply all role rules to the solver model."""
    if not solver.role_rules:
        print("[ROLE_RULES] No role rules to apply", file=sys.stderr)
        return
    
    print(f"\n[ROLE_RULES] Applying {len(solver.role_rules)} role rules", file=sys.stderr)
    
    # Group rules by type for efficient processing
    rules_by_type: Dict[str, List[dict]] = defaultdict(list)
    for rule in solver.role_rules:
        rules_by_type[rule['type']].append(rule)
    
    # Apply each rule type
    for rule_type, rules in rules_by_type.items():
        print(f"   {rule_type}: {len(rules)} rules", file=sys.stderr)
        
        if rule_type == 'FORBID_ROLE':
            _apply_forbid_role(solver, rules)
        elif rule_type == 'MIN_CONSECUTIVE_MINUTES':
            _apply_min_consecutive_minutes(solver, rules)
        elif rule_type == 'MAX_CONSECUTIVE_MINUTES':
            _apply_max_consecutive_minutes(solver, rules)
        elif rule_type == 'CANNOT_BE_ASSIGNED_BEFORE':
            _apply_ordering_constraint(solver, rules, before=True)
        elif rule_type == 'CANNOT_BE_ASSIGNED_AFTER':
            _apply_ordering_constraint(solver, rules, before=False)
        elif rule_type == 'TIMING':
            _apply_timing(solver, rules)
        elif rule_type == 'ASSIGN_BEFORE_SHIFT_MIN_X':
            _apply_assign_before_shift_min(solver, rules)
        elif rule_type == 'ASSIGN_AFTER_SHIFT_MIN_X':
            _apply_assign_after_shift_min(solver, rules)
        elif rule_type == 'LIKE_ROLE_FOR_HOUR_X':
            _apply_hour_preference(solver, rules, like=True)
        elif rule_type == 'DISLIKE_ROLE_FOR_HOUR_X':
            _apply_hour_preference(solver, rules, like=False)
        elif rule_type == 'MIN_SHIFT_LENGTH_FOR_ACCESS':
            _apply_min_shift_length_for_access(solver, rules)
        elif rule_type == 'MAX_CREW_ON_AT_A_TIME':
            _apply_max_crew_on_at_a_time(solver, rules)
        elif rule_type == 'ALLOW_HALF_BLOCKSIZE':
            _apply_allow_half_blocksize(solver, rules)
        elif rule_type == 'DISTRIBUTION_BETWEEN_ROLE_X':
            _apply_distribution_between_roles(solver, rules)
        elif rule_type == 'CANNOT_ASSIGN_DURING_STORE_HOUR_X':
            _apply_cannot_assign_during_store_hour(solver, rules)
        else:
            print(f"      ⚠️  Rule type {rule_type} not yet implemented", file=sys.stderr)


def _get_crew_for_rule(solver: "SolverV2", rule: dict) -> List[dict]:
    """Get the list of crew this rule applies to."""
    crew_id = rule.get('crewId')
    if crew_id:
        # Crew-specific rule
        return [c for c in solver.crew if c['id'] == crew_id]
    # Store-wide rule
    return solver.crew


def _apply_forbid_role(solver: "SolverV2", rules: List[dict]) -> None:
    """FORBID_ROLE: Crew cannot be assigned this role at all.
    
    - If crewId is set: only that crew is forbidden
    - If crewId is null: all crew at the store are forbidden
    - constraintType HARD: assignment is impossible
    - constraintType SOFT: (not implemented yet) would penalize in objective
    """
    m = solver.model
    constraints_added = 0
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        is_hard = rule['constraintType'] == 'HARD'
        crew_id_filter = rule.get('crewId')
        
        if not is_hard:
            print(f"      ⚠️  SOFT FORBID_ROLE not yet implemented", file=sys.stderr)
            continue
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            crew_name = crew.get('name', crew_id)
            
            for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                if var_crew != crew_id or var_role != role_id:
                    continue
                
                # Hard constraint: forbid this assignment
                m.Add(var == 0)
                constraints_added += 1
        
        scope = f"crew {crew_id_filter}" if crew_id_filter else "all crew"
        print(f"      FORBID {role_code} for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} FORBID_ROLE constraints", file=sys.stderr)


def _apply_min_consecutive_minutes(solver: "SolverV2", rules: List[dict]) -> None:
    """MIN_CONSECUTIVE_MINUTES: Minimum consecutive minutes on this role.
    
    valueInt is in minutes. If assigned to this role, crew must stay on it
    for at least valueInt consecutive minutes before switching.
    
    Implementation: If a crew STARTS a block on this role (assigned at slot N 
    but not at slot N-1), they must continue for min_consecutive_minutes slots.
    
    For each slot N where crew could start a new block:
      "If assigned at N and NOT assigned at N-1, then must be assigned at N+1...N+(min_slots-1)"
    """
    m = solver.model
    constraints_added = 0
    slot_minutes = solver.time_grid.slot_minutes
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        min_minutes = rule.get('valueInt', 0)
        
        if not min_minutes or min_minutes <= 0:
            print(f"      ⚠️  MIN_CONSECUTIVE_MINUTES for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        is_hard = rule['constraintType'] == 'HARD'
        
        if not is_hard:
            print(f"      ⚠️  SOFT MIN_CONSECUTIVE_MINUTES not yet implemented", file=sys.stderr)
            continue
        
        # Convert minutes to slots (min_slots in slots)
        min_slots = (min_minutes + slot_minutes - 1) // slot_minutes  # Round up
        
        if min_slots <= 1:
            # 1-slot minimum is always satisfied
            continue
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            shift_start = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            # For each slot, create a "is this slot covered by this role?" indicator
            # We need to track coverage per slot, not per variable
            slot_coverage = {}
            
            for slot in range(shift_start, shift_end):
                covering_vars = []
                for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                    if var_crew != crew_id or var_role != role_id:
                        continue
                    # Does this assignment cover this slot?
                    if var_slot <= slot < var_slot + task_slots:
                        covering_vars.append(var)
                
                if covering_vars:
                    cov_var = m.NewBoolVar(f'minconsec_cov_{crew_id}_{role_id}_{slot}')
                    m.AddMaxEquality(cov_var, covering_vars)
                    slot_coverage[slot] = cov_var
                else:
                    # No variables can cover this slot - it's always 0
                    slot_coverage[slot] = None
            
            # Now add constraints: if slot N is start of a block, must continue
            for slot in range(shift_start, shift_end):
                cov_n = slot_coverage.get(slot)
                if cov_n is None:
                    continue  # Can't be covered anyway
                
                cov_prev = slot_coverage.get(slot - 1)  # Could be None if before shift
                
                # "starts_block" = covered at N AND not covered at N-1
                starts_block = m.NewBoolVar(f'minconsec_start_{crew_id}_{role_id}_{slot}')
                
                if cov_prev is None:
                    # First slot of shift or prev not coverable - starts_block = cov_n
                    m.Add(starts_block == cov_n)
                else:
                    # starts_block = cov_n AND NOT cov_prev
                    # Rewrite as: starts_block => cov_n, starts_block => NOT cov_prev
                    # And: cov_n AND NOT cov_prev => starts_block
                    m.Add(starts_block <= cov_n)
                    m.Add(starts_block <= 1 - cov_prev)
                    m.Add(starts_block >= cov_n - cov_prev)
                
                # If starts_block, then slots N+1 through N+(min_slots-1) must be covered
                for offset in range(1, min_slots):
                    next_slot = slot + offset
                    if next_slot >= shift_end:
                        # Can't start a block here if it would extend past shift end
                        # So forbid starting a block at this slot
                        m.Add(starts_block == 0)
                        break
                    
                    cov_next = slot_coverage.get(next_slot)
                    if cov_next is None:
                        # Next slot can't be covered, so starting here is impossible
                        m.Add(starts_block == 0)
                        break
                    
                    # starts_block => cov_next
                    m.AddImplication(starts_block, cov_next)
                    constraints_added += 1
        
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        print(f"      MIN_CONSECUTIVE_MINUTES {role_code} >= {min_minutes}min ({min_slots} slots) for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} MIN_CONSECUTIVE_MINUTES constraints", file=sys.stderr)


def _apply_max_consecutive_minutes(solver: "SolverV2", rules: List[dict]) -> None:
    """MAX_CONSECUTIVE_MINUTES: Maximum consecutive minutes on this role.
    
    valueInt is in minutes.
    
    HARD constraint: Crew cannot exceed valueInt consecutive minutes. Enforced strictly.
    
    SOFT constraint: Reward getting CLOSE to the max. The closer a consecutive run
    is to the max, the higher the reward. This encourages the solver to give crew
    their preferred consecutive duration rather than just avoiding violations.
    
    Implementation:
    - HARD: For each window of (max_slots + 1), at most max_slots can be covered.
    - SOFT: For each crew's consecutive run, reward based on min(actual, max) / max.
    """
    m = solver.model
    hard_constraints_added = 0
    soft_rewards_added = 0
    slot_minutes = solver.time_grid.slot_minutes
    
    # Reward for achieving the full max consecutive (per block that hits max)
    # This is a positive reward added to objective when crew gets their preferred duration
    # With assignment reward at 100, we want this to be meaningful - 60 per block
    # For a 3hr max (6 slots), per_window_reward = 60/6 = 10 points per covered window
    SOFT_MAX_CONSECUTIVE_REWARD = solver.settings.get('softMaxConsecutiveReward', 60)
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        max_minutes = rule.get('valueInt', 0)
        
        if not max_minutes or max_minutes <= 0:
            print(f"      ⚠️  MAX_CONSECUTIVE_MINUTES for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        is_hard = rule['constraintType'] == 'HARD'
        
        # Convert minutes to slots
        max_slots = max_minutes // slot_minutes
        forbidden_window = max_slots + 1  # Size of window that cannot all be covered
        
        # Bonus settings (applied to BOTH hard and soft)
        FULL_BLOCK_BONUS = solver.settings.get('maxConsecutiveFullBlockBonus', 50)
        ADJACENCY_BONUS = solver.settings.get('maxConsecutiveAdjacencyBonus', 10)
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            shift_start = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            # === CONSTRAINT ENFORCEMENT (HARD only) ===
            if is_hard:
                # HARD constraint: For each window of size (max_slots + 1), not all can be covered
                for window_start in range(shift_start, shift_end - forbidden_window + 1):
                    slot_coverage_vars = []
                    
                    for slot_offset in range(forbidden_window):
                        slot = window_start + slot_offset
                        covering_vars = []
                        
                        for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                            if var_crew != crew_id or var_role != role_id:
                                continue
                            if var_slot <= slot < var_slot + task_slots:
                                covering_vars.append(var)
                        
                        if covering_vars:
                            slot_cov = m.NewBoolVar(f'maxconsec_cov_{crew_id}_{role_id}_{window_start}_{slot_offset}')
                            m.AddMaxEquality(slot_cov, covering_vars)
                            slot_coverage_vars.append(slot_cov)
                    
                    if len(slot_coverage_vars) == forbidden_window:
                        m.Add(sum(slot_coverage_vars) <= max_slots)
                        hard_constraints_added += 1
            
            # === BONUSES (applied to BOTH hard and soft) ===
            # Reward achieving the MAX consecutive duration
            # The crew WANTS to do max_slots consecutive on this role.
            # e.g., max=180 min (6 slots) means "I want 3-hour REG blocks"
            
            # Create slot coverage indicators for this crew+role
            slot_covered = {}
            for slot in range(shift_start, shift_end):
                covering_vars = []
                for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                    if var_crew != crew_id or var_role != role_id:
                        continue
                    if var_slot <= slot < var_slot + task_slots:
                        covering_vars.append(var)
                
                if covering_vars:
                    cov_var = m.NewBoolVar(f'maxconsec_cov_{crew_id}_{role_id}_{slot}')
                    m.AddMaxEquality(cov_var, covering_vars)
                    slot_covered[slot] = cov_var
                else:
                    slot_covered[slot] = None
            
            # 1. ADJACENCY BONUS: For each pair of adjacent slots, reward if both covered
            adjacency_bonuses_added = 0
            for slot in range(shift_start, shift_end - 1):
                curr_cov = slot_covered.get(slot)
                next_cov = slot_covered.get(slot + 1)
                
                if curr_cov is not None and next_cov is not None:
                    adj_var = m.NewBoolVar(f'maxconsec_adj_{crew_id}_{role_id}_{slot}')
                    m.AddMinEquality(adj_var, [curr_cov, next_cov])  # AND
                    solver.soft_constraint_penalties.append(-ADJACENCY_BONUS * adj_var)
                    adjacency_bonuses_added += 1
            
            # 2. FULL BLOCK BONUS: BIG reward for each complete max_slots consecutive block
            full_block_bonuses_added = 0
            for window_start in range(shift_start, shift_end - max_slots + 1):
                window_vars = []
                all_have_coverage = True
                
                for offset in range(max_slots):
                    slot = window_start + offset
                    if slot_covered.get(slot) is not None:
                        window_vars.append(slot_covered[slot])
                    else:
                        all_have_coverage = False
                        break
                
                if all_have_coverage and len(window_vars) == max_slots:
                    full_window = m.NewBoolVar(f'maxconsec_full_{crew_id}_{role_id}_{window_start}')
                    m.AddMinEquality(full_window, window_vars)  # AND of all vars
                    solver.soft_constraint_penalties.append(-FULL_BLOCK_BONUS * full_window)
                    full_block_bonuses_added += 1
            
            soft_rewards_added += full_block_bonuses_added + adjacency_bonuses_added
            print(f"         {crew_id}: {adjacency_bonuses_added} adj + {full_block_bonuses_added} full-block bonuses for {role_code}", file=sys.stderr)
        
        
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        constraint_type = "HARD" if is_hard else "SOFT (reward)"
        print(f"      MAX_CONSECUTIVE_MINUTES ({constraint_type}) {role_code} <= {max_minutes}min ({max_slots} slots) for {scope}", file=sys.stderr)
    
    print(f"      Added {hard_constraints_added} HARD constraints + {soft_rewards_added} SOFT reward terms", file=sys.stderr)


def _apply_ordering_constraint(solver: "SolverV2", rules: List[dict], before: bool) -> None:
    """CANNOT_BE_ASSIGNED_BEFORE / CANNOT_BE_ASSIGNED_AFTER constraints.
    
    CANNOT_BE_ASSIGNED_BEFORE (before=True):
      - roleId cannot appear BEFORE targetRoleId in a crew's schedule
      - If crew does targetRoleId at slot T, they cannot do roleId at any slot < T
      
    CANNOT_BE_ASSIGNED_AFTER (before=False):
      - roleId cannot appear AFTER targetRoleId in a crew's schedule
      - If crew does targetRoleId at slot T, they cannot do roleId at any slot > T
    
    Example: CANNOT_BE_ASSIGNED_BEFORE with roleId=REGISTER, targetRoleId=GREETER
      means "REGISTER cannot come before GREETER" - if you do GREETER, 
      you can't have done REGISTER earlier in the day.
    """
    m = solver.model
    constraints_added = 0
    constraint_name = "CANNOT_BE_ASSIGNED_BEFORE" if before else "CANNOT_BE_ASSIGNED_AFTER"
    
    for rule in rules:
        role_id = rule['roleId']
        target_role_id = rule.get('targetRoleId')
        role_code = rule.get('roleCode', f'role_{role_id}')
        target_role_code = rule.get('targetRoleCode', f'role_{target_role_id}')
        
        if not target_role_id:
            print(f"      ⚠️  {constraint_name} for {role_code} has no targetRoleId, skipping", file=sys.stderr)
            continue
        
        is_hard = rule['constraintType'] == 'HARD'
        
        if not is_hard:
            print(f"      ⚠️  SOFT {constraint_name} not yet implemented", file=sys.stderr)
            continue
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            shift_start = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            # Build slot coverage indicators for both roles
            role_coverage = {}  # slot -> bool var (is role_id covering this slot?)
            target_coverage = {}  # slot -> bool var (is target_role_id covering this slot?)
            
            for slot in range(shift_start, shift_end):
                # Find vars covering this slot for role_id
                role_vars = []
                target_vars = []
                
                for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                    if var_crew != crew_id:
                        continue
                    # Does this assignment cover this slot?
                    if var_slot <= slot < var_slot + task_slots:
                        if var_role == role_id:
                            role_vars.append(var)
                        elif var_role == target_role_id:
                            target_vars.append(var)
                
                if role_vars:
                    cov = m.NewBoolVar(f'ord_role_{crew_id}_{role_id}_{slot}')
                    m.AddMaxEquality(cov, role_vars)
                    role_coverage[slot] = cov
                
                if target_vars:
                    cov = m.NewBoolVar(f'ord_tgt_{crew_id}_{target_role_id}_{slot}')
                    m.AddMaxEquality(cov, target_vars)
                    target_coverage[slot] = cov
            
            # Add ordering constraints
            # BEFORE: if target at slot T, then role cannot be at any slot < T
            # AFTER: if target at slot T, then role cannot be at any slot > T
            for target_slot, target_cov in target_coverage.items():
                if before:
                    # role cannot be BEFORE target
                    # For all slots S < target_slot: target_cov => NOT role_coverage[S]
                    for role_slot in range(shift_start, target_slot):
                        role_cov = role_coverage.get(role_slot)
                        if role_cov is not None:
                            # target_cov => NOT role_cov
                            # Equivalent to: target_cov + role_cov <= 1
                            m.Add(target_cov + role_cov <= 1)
                            constraints_added += 1
                else:
                    # role cannot be AFTER target
                    # For all slots S > target_slot: target_cov => NOT role_coverage[S]
                    for role_slot in range(target_slot + 1, shift_end):
                        role_cov = role_coverage.get(role_slot)
                        if role_cov is not None:
                            # target_cov => NOT role_cov
                            m.Add(target_cov + role_cov <= 1)
                            constraints_added += 1
        
        direction = "before" if before else "after"
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        print(f"      {role_code} cannot be {direction} {target_role_code} for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} {constraint_name} constraints", file=sys.stderr)


def _apply_timing(solver: "SolverV2", rules: List[dict]) -> None:
    """TIMING: Preference for early, middle, or late assignments.
    
    valueInt interpretation:
      -1 = prefer EARLY in shift (bonus for earlier slots)
       0 = prefer MIDDLE in shift (bonus for slots closer to center)
       1 = prefer LATE in shift (bonus for later slots)
    
    This is always a SOFT constraint - adds gradient bonus to objective.
    
    Gradient scoring:
      Position:    Start -------- Center -------- End
      Early (-1):   100%            50%            0%
      Middle (0):    0%            100%            0%
      Late (1):      0%             50%          100%
    """
    # This affects the objective function, not hard constraints
    # Store timing preferences for use in objective.py
    timing_prefs = []
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        timing_value = rule.get('valueInt', 0)
        
        direction_map = {-1: "early", 0: "middle", 1: "late"}
        direction = direction_map.get(timing_value, f"unknown({timing_value})")
        
        timing_prefs.append({
            'roleId': role_id,
            'roleCode': role_code,
            'preference': timing_value,  # -1=early, 0=middle, 1=late
            'crewId': rule.get('crewId'),
        })
        
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        print(f"      TIMING {role_code}: prefer {direction} for {scope}", file=sys.stderr)
    
    # Store on solver for objective function to use
    if not hasattr(solver, 'timing_preferences'):
        solver.timing_preferences = []
    solver.timing_preferences.extend(timing_prefs)
    
    print(f"      Stored {len(timing_prefs)} TIMING preferences for objective", file=sys.stderr)


def _apply_assign_before_shift_min(solver: "SolverV2", rules: List[dict]) -> None:
    """ASSIGN_BEFORE_SHIFT_MIN_X: Must assign this role within first X minutes of shift.
    
    valueInt is the number of minutes from shift start.
    If crew is assigned this role at all, it must START within first X minutes.
    
    Example: ASSIGN_BEFORE_SHIFT_MIN_X with valueInt=60 for PARKING_HELPER
      means if crew does PARKING_HELPER, they must start it within first hour of shift.
    """
    m = solver.model
    constraints_added = 0
    slot_minutes = solver.time_grid.slot_minutes
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        before_minutes = rule.get('valueInt', 0)
        
        if not before_minutes or before_minutes <= 0:
            print(f"      ⚠️  ASSIGN_BEFORE_SHIFT_MIN_X for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        is_hard = rule['constraintType'] == 'HARD'
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            shift_start = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            # Calculate the deadline slot (last allowed start slot)
            deadline_minutes = crew['shiftStartMin'] + before_minutes
            deadline_slot = solver.time_grid.minutes_to_slot_floor(deadline_minutes)
            
            # Find all assignment vars for this crew+role that START after deadline
            late_start_vars = []
            early_start_vars = []
            
            for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                if var_crew != crew_id or var_role != role_id:
                    continue
                
                if var_slot >= deadline_slot:
                    # This assignment starts too late
                    late_start_vars.append(var)
                else:
                    # This assignment starts early enough
                    early_start_vars.append(var)
            
            if is_hard:
                # Hard constraint: forbid all late starts
                for var in late_start_vars:
                    m.Add(var == 0)
                    constraints_added += 1
            else:
                # Soft constraint: penalize late starts (not implemented yet)
                print(f"      ⚠️  SOFT ASSIGN_BEFORE_SHIFT_MIN_X not yet implemented", file=sys.stderr)
        
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        print(f"      {role_code} must start within first {before_minutes}min of shift for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} ASSIGN_BEFORE_SHIFT_MIN_X constraints", file=sys.stderr)


def _apply_assign_after_shift_min(solver: "SolverV2", rules: List[dict]) -> None:
    """ASSIGN_AFTER_SHIFT_MIN_X: Must assign this role after X minutes into shift.
    
    valueInt is the number of minutes from shift start.
    If crew is assigned this role at all, it must START after X minutes into shift.
    
    Example: ASSIGN_AFTER_SHIFT_MIN_X with valueInt=120 for CLOSING_DUTIES
      means if crew does CLOSING_DUTIES, they must start it at least 2 hours into shift.
    """
    m = solver.model
    constraints_added = 0
    slot_minutes = solver.time_grid.slot_minutes
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        after_minutes = rule.get('valueInt', 0)
        
        if not after_minutes or after_minutes <= 0:
            print(f"      ⚠️  ASSIGN_AFTER_SHIFT_MIN_X for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        is_hard = rule['constraintType'] == 'HARD'
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            shift_start = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            # Calculate the earliest allowed start slot
            earliest_minutes = crew['shiftStartMin'] + after_minutes
            earliest_slot = solver.time_grid.minutes_to_slot_floor(earliest_minutes)
            
            # Find all assignment vars for this crew+role that START before earliest
            early_start_vars = []
            
            for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                if var_crew != crew_id or var_role != role_id:
                    continue
                
                if var_slot < earliest_slot:
                    # This assignment starts too early
                    early_start_vars.append(var)
            
            if is_hard:
                # Hard constraint: forbid all early starts
                for var in early_start_vars:
                    m.Add(var == 0)
                    constraints_added += 1
            else:
                # Soft constraint: penalize early starts (not implemented yet)
                print(f"      ⚠️  SOFT ASSIGN_AFTER_SHIFT_MIN_X not yet implemented", file=sys.stderr)
        
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        print(f"      {role_code} must start after {after_minutes}min into shift for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} ASSIGN_AFTER_SHIFT_MIN_X constraints", file=sys.stderr)


def _apply_hour_preference(solver: "SolverV2", rules: List[dict], like: bool) -> None:
    """LIKE_ROLE_FOR_HOUR_X / DISLIKE_ROLE_FOR_HOUR_X: Hour-specific preferences.
    
    valueInt is the number of minutes from the START of the crew's shift.
    e.g., valueInt=0 means first hour of shift (minutes 0-60 of their shift)
          valueInt=60 means second hour of shift (minutes 60-120 of their shift)
          valueInt=420 means hour 8 of shift (minutes 420-480 of their shift)
    
    LIKE_ROLE_FOR_HOUR_X (like=True):
      - Crew prefers to be assigned this role during that hour of their shift
      - Adds a bonus to the objective for assignments in that hour
      
    DISLIKE_ROLE_FOR_HOUR_X (like=False):
      - Crew dislikes being assigned this role during that hour of their shift
      - Adds a penalty to the objective for assignments in that hour
      - If HARD constraint, forbids the assignment entirely
    
    Example: LIKE_ROLE_FOR_HOUR_X with valueInt=0 for REGISTER
      means crew prefers REGISTER during their first hour of work
    """
    # Build crew shift lookup for converting relative to absolute time
    crew_shift_start = {}
    for crew in solver.crew:
        crew_shift_start[crew['id']] = crew.get('shiftStartMin', 0)
    
    # Store hour preferences for use in objective function
    hour_prefs = []
    constraint_name = "LIKE_ROLE_FOR_HOUR_X" if like else "DISLIKE_ROLE_FOR_HOUR_X"
    constraints_added = 0
    m = solver.model
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        shift_relative_min = rule.get('valueInt')  # Minutes from shift start
        is_hard = rule.get('constraintType') == 'HARD'
        
        if shift_relative_min is None:
            print(f"      ⚠️  {constraint_name} for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        # For HARD DISLIKE, we forbid the assignment entirely
        if is_hard and not like:
            for crew in _get_crew_for_rule(solver, rule):
                crew_id = crew['id']
                shift_start = crew_shift_start.get(crew_id, 0)
                
                # Convert shift-relative to absolute time
                target_hour_start = shift_start + shift_relative_min
                target_hour_end = target_hour_start + 60
                
                for (var_crew, slot, var_role, task_slots), var in solver.assignment_vars.items():
                    if var_crew != crew_id or var_role != role_id:
                        continue
                    
                    # Check if this slot overlaps with the target hour (absolute time)
                    slot_start_min = slot * solver.time_grid.slot_minutes
                    slot_end_min = slot_start_min + (task_slots * solver.time_grid.slot_minutes)
                    
                    if slot_start_min < target_hour_end and slot_end_min > target_hour_start:
                        # Forbid this assignment
                        m.Add(var == 0)
                        constraints_added += 1
            
            scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
            print(f"      HARD: {role_code} forbidden at shift min {shift_relative_min} for {scope}", file=sys.stderr)
        else:
            # Soft constraint: store preference for objective function
            # We store the shift-relative minute; objective function will convert per-crew
            hour_prefs.append({
                'roleId': role_id,
                'roleCode': role_code,
                'shiftRelativeMin': shift_relative_min,  # Minutes from shift start
                'like': like,  # True = bonus, False = penalty
                'crewId': rule.get('crewId'),
            })
            
            pref_type = "like" if like else "dislike"
            scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
            print(f"      SOFT: {role_code} {pref_type} at shift min {shift_relative_min} for {scope}", file=sys.stderr)
    
    # Store on solver for objective function to use
    if not hasattr(solver, 'hour_preferences'):
        solver.hour_preferences = []
    solver.hour_preferences.extend(hour_prefs)
    
    if constraints_added > 0:
        print(f"      Added {constraints_added} HARD {constraint_name} constraints", file=sys.stderr)
    if hour_prefs:
        print(f"      Stored {len(hour_prefs)} SOFT {constraint_name} preferences for objective", file=sys.stderr)


def _apply_min_shift_length_for_access(solver: "SolverV2", rules: List[dict]) -> None:
    """MIN_SHIFT_LENGTH_FOR_ACCESS: Crew must have minimum shift length to be assigned role.
    
    valueInt is the minimum shift length in minutes.
    
    If a crew member's shift is shorter than valueInt minutes, they cannot be 
    assigned this role at all.
    
    Example: MIN_SHIFT_LENGTH_FOR_ACCESS with valueInt=240 for REGISTER
      means only crew with 4+ hour shifts can do REGISTER.
    
    This is always a HARD constraint.
    """
    m = solver.model
    constraints_added = 0
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        min_shift_minutes = rule.get('valueInt') or 0
        
        if min_shift_minutes <= 0:
            print(f"      ⚠️  MIN_SHIFT_LENGTH_FOR_ACCESS for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        # Check each crew member's shift length
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            shift_start = crew.get('shiftStartMin', 0)
            shift_end = crew.get('shiftEndMin', 0)
            shift_length = shift_end - shift_start
            
            if shift_length < min_shift_minutes:
                # This crew's shift is too short - forbid all assignments of this role
                for (var_crew, slot, var_role, task_slots), var in solver.assignment_vars.items():
                    if var_crew == crew_id and var_role == role_id:
                        m.Add(var == 0)
                        constraints_added += 1
                
                print(f"      {crew_id} shift={shift_length}min < {min_shift_minutes}min, forbidden from {role_code}", file=sys.stderr)
        
        scope = f"crew {rule.get('crewId')}" if rule.get('crewId') else "all crew"
        print(f"      {role_code} requires {min_shift_minutes}min shift for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} MIN_SHIFT_LENGTH_FOR_ACCESS constraints", file=sys.stderr)


def _apply_max_crew_on_at_a_time(solver: "SolverV2", rules: List[dict]) -> None:
    """MAX_CREW_ON_AT_A_TIME: Limit how many crew can be on this role simultaneously.
    
    valueInt is the maximum number of crew that can be assigned to this role
    at any given time slot. For example, valueInt=4 means at most 4 crew
    can be on this role at once.
    """
    m = solver.model
    constraints_added = 0
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        max_crew = rule.get('valueInt', 0)
        is_hard = rule['constraintType'] == 'HARD'
        
        if not max_crew or max_crew <= 0:
            print(f"      ⚠️  MAX_CREW_ON_AT_A_TIME for {role_code} has no valueInt, skipping", file=sys.stderr)
            continue
        
        if not is_hard:
            print(f"      ⚠️  SOFT MAX_CREW_ON_AT_A_TIME not yet implemented", file=sys.stderr)
            continue
        
        # For each time slot, count how many crew are assigned to this role
        # and ensure it doesn't exceed max_crew
        all_slots = set()
        for (crew_id, slot, var_role, task_slots), var in solver.assignment_vars.items():
            if var_role == role_id:
                # This variable covers slots from 'slot' to 'slot + task_slots - 1'
                for s in range(slot, slot + task_slots):
                    all_slots.add(s)
        
        for slot in sorted(all_slots):
            # Collect all variables that cover this slot for this role
            covering_vars = []
            for (crew_id, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                if var_role != role_id:
                    continue
                # Does this assignment cover this slot?
                if var_slot <= slot < var_slot + task_slots:
                    covering_vars.append(var)
            
            if len(covering_vars) > max_crew:
                # Only add constraint if there are more potential assignments than allowed
                m.Add(sum(covering_vars) <= max_crew)
                constraints_added += 1
        
        print(f"      MAX_CREW_ON_AT_A_TIME {role_code} <= {max_crew} crew", file=sys.stderr)
    
    print(f"      Added {constraints_added} MAX_CREW_ON_AT_A_TIME constraints", file=sys.stderr)


def _apply_allow_half_blocksize(solver: "SolverV2", rules: List[dict]) -> None:
    """ALLOW_HALF_BLOCKSIZE: Allow half-length task assignments for a role.
    
    This is a metadata flag that affects variable generation, not a constraint.
    When set, the VariableBuilder should create variables with task_slots/2
    in addition to the normal task_slots.
    
    NOTE: This rule is processed during variable building, not here.
    This function just logs that the rule was seen.
    """
    for rule in rules:
        role_code = rule.get('roleCode', f"role_{rule['roleId']}")
        print(f"      ALLOW_HALF_BLOCKSIZE for {role_code} (handled in variable building)", file=sys.stderr)


def _apply_distribution_between_roles(solver: "SolverV2", rules: List[dict]) -> None:
    """DISTRIBUTION_BETWEEN_ROLE_X: Prefer even time distribution between role FAMILIES.
    
    Uses roleId and targetRoleId to look up their respective families, then
    balances total time across all roles in each family.
    
    This is a SOFT preference that encourages crew to spend similar amounts
    of time on roles in the primary family vs roles in the target family.
    
    valueInt meanings:
      -1 = prefer more time on primary family roles
       0 = prefer equal time on both families
       1 = prefer more time on target family roles
    
    Implementation: Add bonus/penalty to objective based on family time balance.
    """
    # Build role -> family lookup
    role_to_family = {}
    family_to_roles = {}
    family_names = {}
    
    for family in solver.role_families:
        family_id = family['id']
        family_names[family_id] = family.get('name', f'family_{family_id}')
        family_to_roles[family_id] = set(family.get('roleIds', []))
        for role_id in family.get('roleIds', []):
            role_to_family[role_id] = family_id
    
    # Also check roles for familyId field
    for role in solver.roles:
        if 'familyId' in role and role['familyId']:
            role_to_family[role['id']] = role['familyId']
            if role['familyId'] not in family_to_roles:
                family_to_roles[role['familyId']] = set()
            family_to_roles[role['familyId']].add(role['id'])
    
    # Store the distribution preferences for the objective function to use
    if not hasattr(solver, 'distribution_preferences'):
        solver.distribution_preferences = []
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        target_role_id = rule.get('targetRoleId')
        target_role_code = rule.get('targetRoleCode', f'role_{target_role_id}')
        preference = rule.get('valueInt', 0)  # -1, 0, or 1
        is_hard = rule['constraintType'] == 'HARD'
        crew_id = rule.get('crewId')
        
        if target_role_id is None:
            print(f"      ⚠️  DISTRIBUTION_BETWEEN_ROLE_X for {role_code} has no targetRoleId, skipping", file=sys.stderr)
            continue
        
        if is_hard:
            print(f"      ⚠️  HARD DISTRIBUTION_BETWEEN_ROLE_X not supported (use SOFT)", file=sys.stderr)
            continue
        
        # Look up families for both roles
        primary_family_id = role_to_family.get(role_id)
        target_family_id = role_to_family.get(target_role_id)
        
        if primary_family_id is None or target_family_id is None:
            # Fall back to individual role balancing if no families defined
            print(f"      ⚠️  Roles not in families, falling back to role-level balance", file=sys.stderr)
            solver.distribution_preferences.append({
                'mode': 'role',  # Individual role balance
                'roleId': role_id,
                'roleCode': role_code,
                'targetRoleId': target_role_id,
                'targetRoleCode': target_role_code,
                'preference': preference,
                'crewId': crew_id,
            })
        else:
            # Family-level balancing
            primary_family_name = family_names.get(primary_family_id, f'family_{primary_family_id}')
            target_family_name = family_names.get(target_family_id, f'family_{target_family_id}')
            primary_role_ids = list(family_to_roles.get(primary_family_id, set()))
            target_role_ids = list(family_to_roles.get(target_family_id, set()))
            
            solver.distribution_preferences.append({
                'mode': 'family',  # Family-level balance
                'primaryFamilyId': primary_family_id,
                'primaryFamilyName': primary_family_name,
                'primaryRoleIds': primary_role_ids,
                'targetFamilyId': target_family_id,
                'targetFamilyName': target_family_name,
                'targetRoleIds': target_role_ids,
                'preference': preference,
                'crewId': crew_id,
            })
            
            scope = f"crew {crew_id}" if crew_id else "all crew"
            pref_str = {-1: "prefer primary", 0: "equal", 1: "prefer target"}[preference]
            print(f"      DISTRIBUTION {primary_family_name} <-> {target_family_name}: {pref_str} for {scope}", file=sys.stderr)
    
    print(f"      Stored {len(solver.distribution_preferences)} distribution preferences for objective", file=sys.stderr)


def _apply_cannot_assign_during_store_hour(solver: "SolverV2", rules: List[dict]) -> None:
    """CANNOT_ASSIGN_DURING_STORE_HOUR_X: Forbid role assignment during a specific hour.
    
    valueInt is the hour in minutes from midnight (e.g., 480 = 08:00, 540 = 09:00).
    The rule forbids assignments for the role during that hour (60-minute window).
    
    - If crewId is set: only that crew is forbidden
    - If crewId is null: all crew are forbidden
    - constraintType HARD: assignment is impossible
    - constraintType SOFT: (not implemented yet) would penalize in objective
    """
    m = solver.model
    constraints_added = 0
    slot_minutes = solver.time_grid.slot_minutes
    
    for rule in rules:
        role_id = rule['roleId']
        role_code = rule.get('roleCode', f'role_{role_id}')
        hour_minutes = rule.get('valueInt')
        is_hard = rule['constraintType'] == 'HARD'
        crew_id_filter = rule.get('crewId')
        
        if hour_minutes is None:
            print(f"      ⚠️  CANNOT_ASSIGN_DURING_STORE_HOUR_X missing valueInt (hour in minutes)", file=sys.stderr)
            continue
        
        if not is_hard:
            print(f"      ⚠️  SOFT CANNOT_ASSIGN_DURING_STORE_HOUR_X not yet implemented", file=sys.stderr)
            continue
        
        # Calculate which slots fall within this hour
        # hour_minutes is the START of the hour (e.g., 480 = 08:00)
        # The hour spans [hour_minutes, hour_minutes + 60)
        hour_start = hour_minutes
        hour_end = hour_minutes + 60
        
        for crew in _get_crew_for_rule(solver, rule):
            crew_id = crew['id']
            
            for (var_crew, var_slot, var_role, task_slots), var in solver.assignment_vars.items():
                if var_crew != crew_id or var_role != role_id:
                    continue
                
                # Calculate slot time range
                slot_start = var_slot * slot_minutes
                slot_end = slot_start + (task_slots * slot_minutes)
                
                # Check if any part of this assignment overlaps with the forbidden hour
                if slot_start < hour_end and slot_end > hour_start:
                    # Assignment overlaps with forbidden hour - forbid it
                    m.Add(var == 0)
                    constraints_added += 1
        
        scope = f"crew {crew_id_filter}" if crew_id_filter else "all crew"
        hour_str = f"{hour_minutes // 60:02d}:{hour_minutes % 60:02d}"
        print(f"      CANNOT_ASSIGN {role_code} during hour {hour_str} for {scope}", file=sys.stderr)
    
    print(f"      Added {constraints_added} CANNOT_ASSIGN_DURING_STORE_HOUR_X constraints", file=sys.stderr)


__all__ = ["apply_role_rules"]
