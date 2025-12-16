"""Objective builder for SolverV2."""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import TYPE_CHECKING, Dict, List, Tuple

if TYPE_CHECKING:  # pragma: no cover
    from .solver_v2 import SolverV2

# Default values for tunable parameters
DEFAULT_ASSIGNMENT_REWARD = 100  # Reward for each assignment (fills slots) - HIGH to prioritize coverage
DEFAULT_HALF_SIZE_PENALTY_RATIO = 0.85  # Gap filler gets reduced reward
DEFAULT_CONSECUTIVE_BONUS = 10  # Bonus for adjacent same-role assignments (PREFERRED policy)
DEFAULT_HOUR_ALIGNED_BONUS = 15  # Bonus for starting 60min tasks at :00 (not :30)


def apply(solver: "SolverV2") -> None:
    model = solver.model
    slot_minutes = solver.time_grid.slot_minutes
    
    # Read tunable settings with defaults
    assignment_reward = solver.settings.get('assignmentReward', DEFAULT_ASSIGNMENT_REWARD)
    half_size_penalty_ratio = solver.settings.get('halfSizePenaltyRatio', DEFAULT_HALF_SIZE_PENALTY_RATIO)
    half_size_penalty = assignment_reward * half_size_penalty_ratio
    hour_aligned_bonus = solver.settings.get('hourAlignedBonus', DEFAULT_HOUR_ALIGNED_BONUS)
    
    weighted_terms = []
    assignment_rewards = []
    gap_filler_penalties = []
    hour_aligned_bonuses = []

    # Build lookup for role's full task_slots
    role_full_task_slots = {}
    for role in solver.roles:
        task_length = role.get('taskLength') or solver.time_grid.slot_minutes
        full_slots = solver.time_grid.task_length_to_slots(task_length)
        role_full_task_slots[role['id']] = full_slots

    for key, var in solver.assignment_vars.items():
        crew_id, slot, role_id, task_slots = key
        
        # MOTIVATOR: Reward every assignment to encourage filling all slots
        assignment_rewards.append(assignment_reward * var)
        
        # Standard preference weight
        weight = solver.preference_weight(key)
        if weight > 0:
            weighted_terms.append(weight * var)
        
        # Check if this is a half-size assignment (gap filler)
        full_slots = role_full_task_slots.get(role_id, task_slots)
        if task_slots < full_slots:
            # This is a gap-filler (half-size) - add penalty to prefer full taskLength
            gap_filler_penalties.append(half_size_penalty * var)
        
        # Hour-aligned bonus: for 60min+ tasks, prefer starting at :00 (not :30)
        # This discourages splitting tasks across the hour boundary
        task_length_minutes = task_slots * slot_minutes
        if task_length_minutes >= 60:
            start_minute = slot * slot_minutes
            # Check if start is aligned to the hour (divisible by 60)
            if start_minute % 60 == 0:
                hour_aligned_bonuses.append(hour_aligned_bonus * var)

    # Add consecutive bonus for PREFERRED policy roles
    consecutive_bonus_terms = _consecutive_role_bonus(solver)
    
    # Add TIMING preference bonuses (gradient-based early/late preference)
    timing_bonus_terms = _timing_preference_bonus(solver)
    
    # Add hour-specific LIKE/DISLIKE preferences
    hour_pref_terms = _hour_preference_bonus(solver)
    
    # Add distribution between roles preferences
    distribution_terms = _distribution_preference_bonus(solver)
    
    # Soft constraint penalties from role rules (e.g., soft MAX_CONSECUTIVE_MINUTES)
    soft_penalties = solver.soft_constraint_penalties

    # Maximize: assignment rewards + preferences + bonuses - penalties
    # This motivates solver to fill all slots while respecting preferences
    rewards = sum(assignment_rewards) if assignment_rewards else 0
    preferences = sum(weighted_terms) if weighted_terms else 0
    consecutive_bonus = sum(consecutive_bonus_terms) if consecutive_bonus_terms else 0
    aligned_bonus = sum(hour_aligned_bonuses) if hour_aligned_bonuses else 0
    timing_bonus = sum(timing_bonus_terms) if timing_bonus_terms else 0
    hour_pref_bonus = sum(hour_pref_terms) if hour_pref_terms else 0
    distribution_bonus = sum(distribution_terms) if distribution_terms else 0
    gap_penalties = sum(gap_filler_penalties) if gap_filler_penalties else 0
    soft_constraint_penalties = sum(soft_penalties) if soft_penalties else 0
    
    model.Maximize(rewards + preferences + consecutive_bonus + aligned_bonus + timing_bonus + hour_pref_bonus + distribution_bonus - gap_penalties - soft_constraint_penalties)


def _consecutive_role_bonus(solver: "SolverV2") -> List:
    """
    Create bonus terms for consecutive assignments of roles with consecutivePolicy = PREFERRED.
    
    For each crew member and role with PREFERRED policy, we give a bonus when adjacent
    slots are both assigned to the same crew+role, encouraging the solver to keep
    assignments contiguous rather than fragmented.
    """
    model = solver.model
    consecutive_bonus = solver.settings.get('consecutiveBonus', DEFAULT_CONSECUTIVE_BONUS)
    
    bonus_terms = []
    
    # Find roles with PREFERRED consecutive policy
    preferred_role_ids = set()
    for role in solver.roles:
        if role.get('consecutivePolicy') == 'PREFERRED':
            preferred_role_ids.add(role['id'])
    
    if not preferred_role_ids:
        return bonus_terms
    
    # Group assignment vars by (crew_id, role_id) for efficient lookup
    # Key: (crew_id, role_id) -> {slot: var}
    vars_by_crew_role: Dict[Tuple[int, int], Dict[int, list]] = defaultdict(dict)
    
    for key, var in solver.assignment_vars.items():
        crew_id, slot, role_id, task_slots = key
        if role_id in preferred_role_ids:
            # Store vars by slot for this crew+role combination
            if slot not in vars_by_crew_role[(crew_id, role_id)]:
                vars_by_crew_role[(crew_id, role_id)][slot] = []
            vars_by_crew_role[(crew_id, role_id)][slot].append(var)
    
    # For each crew+role combo with PREFERRED policy, create adjacency bonuses
    for (crew_id, role_id), slot_vars in vars_by_crew_role.items():
        sorted_slots = sorted(slot_vars.keys())
        
        for i in range(len(sorted_slots) - 1):
            slot = sorted_slots[i]
            next_slot = sorted_slots[i + 1]
            
            # Check if slots are adjacent (next_slot = slot + 1)
            if next_slot == slot + 1:
                # Get all vars for current and next slot
                current_vars = slot_vars[slot]
                next_vars = slot_vars[next_slot]
                
                # Create adjacency bonus variable: gets the bonus when BOTH are assigned
                # For each combination of vars at adjacent slots
                for curr_var in current_vars:
                    for next_var in next_vars:
                        # Create a variable that's 1 only when both are assigned
                        # Using min(var1, var2) via an auxiliary variable
                        adj_var = model.NewBoolVar(
                            f'adj_bonus_c{crew_id}_r{role_id}_s{slot}_s{next_slot}'
                        )
                        # adj_var can only be 1 if both curr_var and next_var are 1
                        model.Add(adj_var <= curr_var)
                        model.Add(adj_var <= next_var)
                        # This incentivizes adj_var to be 1 when both are 1
                        # (the maximization will push it to be 1)
                        
                        bonus_terms.append(consecutive_bonus * adj_var)
    
    return bonus_terms


# Default weight for timing preference bonuses
DEFAULT_TIMING_BONUS_WEIGHT = 5


def _timing_preference_bonus(solver: "SolverV2") -> List:
    """
    Create gradient-based bonus terms for TIMING role rules.
    
    For roles with TIMING preference:
      - valueInt = -1 (prefer EARLY): earlier slots in shift get higher bonus
      - valueInt = 0 (prefer MIDDLE): slots closer to center get higher bonus
      - valueInt = 1 (prefer LATE): later slots in shift get higher bonus
    
    The bonus is a GRADIENT based on position in the crew's shift:
      - For early (-1): bonus = (1 - position_ratio) * weight
      - For middle (0): bonus = (1 - 2*|position_ratio - 0.5|) * weight
      - For late (1): bonus = position_ratio * weight
    
    Where position_ratio = (slot - shift_start) / (shift_end - shift_start)
    
    Visual representation (bonus factor):
      Position:    Start -------- Center -------- End
      Early (-1):   1.0            0.5            0.0
      Middle (0):   0.0            1.0            0.0
      Late (1):     0.0            0.5            1.0
    """
    if not hasattr(solver, 'timing_preferences') or not solver.timing_preferences:
        return []
    
    timing_weight = solver.settings.get('timingBonusWeight', DEFAULT_TIMING_BONUS_WEIGHT)
    bonus_terms = []
    
    # Build lookup: crew_id -> (shift_start_slot, shift_end_slot)
    crew_shifts = {}
    for crew in solver.crew:
        crew_id = crew['id']
        start_min = crew.get('shiftStartMin', 0)
        end_min = crew.get('shiftEndMin', 1440)
        start_slot = solver.time_grid.minutes_to_slot_floor(start_min)
        end_slot = solver.time_grid.minutes_to_slot_floor(end_min)
        crew_shifts[crew_id] = (start_slot, end_slot)
    
    # Build lookup: role_id -> timing preference (-1, 0, or 1)
    # Also track crew-specific overrides
    role_timing = {}  # role_id -> preference
    crew_role_timing = {}  # (crew_id, role_id) -> preference
    
    for pref in solver.timing_preferences:
        role_id = pref['roleId']
        timing_val = pref['preference']
        crew_id = pref.get('crewId')
        
        if crew_id:
            crew_role_timing[(crew_id, role_id)] = timing_val
        else:
            role_timing[role_id] = timing_val
    
    # Apply gradient bonus to each assignment var
    for key, var in solver.assignment_vars.items():
        crew_id, slot, role_id, task_slots = key
        
        # Get timing preference (crew-specific overrides store-wide)
        timing_pref = crew_role_timing.get((crew_id, role_id))
        if timing_pref is None:
            timing_pref = role_timing.get(role_id)
        
        if timing_pref is None:
            continue  # No timing preference for this role
        
        # Get crew's shift boundaries
        shift_start, shift_end = crew_shifts.get(crew_id, (0, solver.time_grid.num_slots))
        shift_length = shift_end - shift_start
        
        if shift_length <= 0:
            continue
        
        # Calculate position ratio (0.0 = start of shift, 1.0 = end of shift)
        position_in_shift = slot - shift_start
        position_ratio = position_in_shift / shift_length
        
        # Calculate bonus based on timing preference
        if timing_pref < 0:
            # Prefer EARLY: earlier slots get higher bonus
            # At shift start (ratio=0): bonus = 1.0 * weight
            # At shift end (ratio=1): bonus = 0.0 * weight
            bonus_factor = (1.0 - position_ratio)
        elif timing_pref > 0:
            # Prefer LATE: later slots get higher bonus
            # At shift start (ratio=0): bonus = 0.0 * weight
            # At shift end (ratio=1): bonus = 1.0 * weight
            bonus_factor = position_ratio
        else:
            # Prefer MIDDLE: slots closer to center get higher bonus
            # At center (ratio=0.5): bonus = 1.0 * weight
            # At edges (ratio=0 or 1): bonus = 0.0 * weight
            center_distance = abs(position_ratio - 0.5)  # 0 at center, 0.5 at edges
            bonus_factor = 1.0 - (2.0 * center_distance)  # 1 at center, 0 at edges
        
        # Scale the bonus and add to objective
        # Use integer scaling (multiply by 100) for CP-SAT which prefers integers
        scaled_bonus = int(bonus_factor * timing_weight * 100)
        if scaled_bonus > 0:
            bonus_terms.append(scaled_bonus * var)
    
    if bonus_terms:
        print(f"    [Objective] Added {len(bonus_terms)} TIMING gradient bonuses", file=sys.stderr)
    
    return bonus_terms


# Default weight for hour-specific preferences
DEFAULT_HOUR_PREFERENCE_WEIGHT = 50


def _hour_preference_bonus(solver: "SolverV2") -> List:
    """
    Create bonus/penalty terms for LIKE_ROLE_FOR_HOUR_X and DISLIKE_ROLE_FOR_HOUR_X.
    
    For each assignment var that falls within a preferred/disliked hour:
      - LIKE: Add a bonus to encourage the assignment
      - DISLIKE: Add a negative term (penalty) to discourage the assignment
    
    This only handles SOFT constraints - HARD DISLIKE is handled in role_rules.py
    """
    if not hasattr(solver, 'hour_preferences') or not solver.hour_preferences:
        return []
    
    hour_weight = solver.settings.get('hourPreferenceWeight', DEFAULT_HOUR_PREFERENCE_WEIGHT)
    bonus_terms = []
    slot_minutes = solver.time_grid.slot_minutes
    
    # Build lookups for hour preferences
    # role_id -> hour -> preference (like=True means +bonus, like=False means -penalty)
    role_hour_prefs = {}  # (role_id, hour) -> like
    crew_role_hour_prefs = {}  # (crew_id, role_id, hour) -> like
    
    for pref in solver.hour_preferences:
        role_id = pref['roleId']
        hour = pref['hour']
        like = pref['like']
        crew_id = pref.get('crewId')
        
        if crew_id:
            crew_role_hour_prefs[(crew_id, role_id, hour)] = like
        else:
            role_hour_prefs[(role_id, hour)] = like
    
    # Apply bonuses/penalties to each assignment var
    for key, var in solver.assignment_vars.items():
        crew_id, slot, role_id, task_slots = key
        
        # Calculate the hour for this slot
        slot_start_min = slot * slot_minutes
        slot_hour = slot_start_min // 60
        
        # Check for crew-specific preference first, then store-wide
        like = crew_role_hour_prefs.get((crew_id, role_id, slot_hour))
        if like is None:
            like = role_hour_prefs.get((role_id, slot_hour))
        
        if like is None:
            continue  # No hour preference for this role/hour combo
        
        if like:
            # LIKE: add bonus
            bonus_terms.append(hour_weight * var)
        else:
            # DISLIKE: add penalty (negative bonus)
            bonus_terms.append(-hour_weight * var)
    
    if bonus_terms:
        print(f"    [Objective] Added {len(bonus_terms)} hour preference terms", file=sys.stderr)
    
    return bonus_terms


# Default weight for distribution preference bonuses
# This should be significant enough to influence role choice when coverage is equal
# With assignment reward at 100, a weight of 30 means: preferred role = 130, other = 100
DEFAULT_DISTRIBUTION_WEIGHT = 30


def _distribution_preference_bonus(solver: "SolverV2") -> List:
    """
    Create bonus terms for DISTRIBUTION_BETWEEN_ROLE_X preferences.
    
    Supports two modes:
      - 'family': Balance time across role FAMILIES (sum all roles in each family)
      - 'role': Balance time between two individual roles (fallback)
    
    valueInt meanings:
      - -1: prefer more time on primary family/role
      - 0: prefer equal time on both families/roles (minimize difference)
      - 1: prefer more time on target family/role
    
    Implementation: 
      For preference=-1 or 1: Give bonus to primary or target assignments
      For preference=0: Penalize the absolute difference between families/roles
    """
    if not hasattr(solver, 'distribution_preferences') or not solver.distribution_preferences:
        return []
    
    distribution_weight = solver.settings.get('distributionWeight', DEFAULT_DISTRIBUTION_WEIGHT)
    bonus_terms = []
    slot_minutes = solver.time_grid.slot_minutes
    
    for pref in solver.distribution_preferences:
        mode = pref.get('mode', 'role')
        preference = pref['preference']  # -1, 0, or 1
        crew_filter = pref.get('crewId')
        
        # Get relevant crew
        relevant_crew = []
        for crew in solver.crew:
            if crew_filter is None or crew['id'] == crew_filter:
                relevant_crew.append(crew['id'])
        
        if mode == 'family':
            # Family-level balancing: sum time across all roles in each family
            primary_role_ids = set(pref.get('primaryRoleIds', []))
            target_role_ids = set(pref.get('targetRoleIds', []))
            primary_family_name = pref.get('primaryFamilyName', 'primary')
            target_family_name = pref.get('targetFamilyName', 'target')
            
            for crew_id in relevant_crew:
                # Collect vars for all roles in both families
                primary_vars = []  # (var, minutes)
                target_vars = []  # (var, minutes)
                
                for key, var in solver.assignment_vars.items():
                    var_crew, slot, var_role, task_slots = key
                    if var_crew != crew_id:
                        continue
                    
                    minutes = task_slots * slot_minutes
                    if var_role in primary_role_ids:
                        primary_vars.append((var, minutes))
                    elif var_role in target_role_ids:
                        target_vars.append((var, minutes))
                
                if not primary_vars or not target_vars:
                    continue  # Need both families for this preference
                
                # Apply bonus based on preference direction
                if preference == -1:
                    # Prefer primary family
                    for var, minutes in primary_vars:
                        bonus_terms.append(distribution_weight * var)
                elif preference == 1:
                    # Prefer target family
                    for var, minutes in target_vars:
                        bonus_terms.append(distribution_weight * var)
                else:
                    # preference == 0: prefer equal distribution
                    # Give EQUAL bonus to both families - this encourages filling
                    # slots with EITHER family, achieving natural balance.
                    # The solver will fill all slots (to maximize bonus) and
                    # distribute evenly (since both give equal reward).
                    for var, minutes in primary_vars:
                        bonus_terms.append(distribution_weight * var)
                    for var, minutes in target_vars:
                        bonus_terms.append(distribution_weight * var)
                    
                    print(f"      Added equal bonus for {crew_id}: {primary_family_name} and {target_family_name}", file=sys.stderr)
        
        else:
            # Role-level balancing (fallback)
            role_id = pref['roleId']
            target_role_id = pref['targetRoleId']
            
            for crew_id in relevant_crew:
                # Collect vars for both roles for this crew
                role_vars = []  # (var, minutes)
                target_vars = []  # (var, minutes)
                
                for key, var in solver.assignment_vars.items():
                    var_crew, slot, var_role, task_slots = key
                    if var_crew != crew_id:
                        continue
                    
                    minutes = task_slots * slot_minutes
                    if var_role == role_id:
                        role_vars.append((var, minutes))
                    elif var_role == target_role_id:
                        target_vars.append((var, minutes))
                
                if not role_vars or not target_vars:
                    continue  # Need both roles for this preference
                
                # Apply bonus based on preference direction
                if preference == -1:
                    # Prefer primary role
                    for var, minutes in role_vars:
                        bonus_terms.append(distribution_weight * var)
                elif preference == 1:
                    # Prefer target role
                    for var, minutes in target_vars:
                        bonus_terms.append(distribution_weight * var)
                else:
                    # preference == 0: prefer equal distribution
                    # Give EQUAL bonus to both roles
                    for var, minutes in role_vars:
                        bonus_terms.append(distribution_weight * var)
                    for var, minutes in target_vars:
                        bonus_terms.append(distribution_weight * var)
    
    if bonus_terms:
        print(f"    [Objective] Added {len(bonus_terms)} distribution preference terms", file=sys.stderr)
    
    return bonus_terms


__all__ = ["apply"]
