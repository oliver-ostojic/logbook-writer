"""Objective builder for SolverV2."""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import TYPE_CHECKING, Dict, List, Tuple

if TYPE_CHECKING:  # pragma: no cover
    from .solver_v2 import SolverV2

# Default values for tunable parameters
DEFAULT_ASSIGNMENT_REWARD = 10
DEFAULT_HALF_SIZE_PENALTY_RATIO = 0.85  # Gap filler gets +5 net (10 - 5), full gets +10
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

    # Maximize: assignment rewards + preferences + bonuses - penalties
    # This motivates solver to fill all slots while respecting preferences
    rewards = sum(assignment_rewards) if assignment_rewards else 0
    preferences = sum(weighted_terms) if weighted_terms else 0
    consecutive_bonus = sum(consecutive_bonus_terms) if consecutive_bonus_terms else 0
    aligned_bonus = sum(hour_aligned_bonuses) if hour_aligned_bonuses else 0
    gap_penalties = sum(gap_filler_penalties) if gap_filler_penalties else 0
    
    model.Maximize(rewards + preferences + consecutive_bonus + aligned_bonus - gap_penalties)


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


__all__ = ["apply"]
