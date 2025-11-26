"""Objective construction for the LogbookSolver."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from .core import LogbookSolver


def add_objective(solver: "LogbookSolver") -> None:
    """Build and attach the weighted preference objective using preferences array."""

    terms = []

    # NEW: Iterate over preferences array instead of hardcoded crew/store fields
    for pref in solver.preferences:
        crew_id = pref['crewId']
        pref_type = pref['preferenceType']
        role = pref.get('role')
        base_weight = pref['baseWeight']
        crew_weight = pref['crewWeight']
        adaptive_boost = pref.get('adaptiveBoost', 1.0)
        int_value = pref.get('intValue')

        crew = solver.crew_by_id.get(crew_id)
        if not crew:
            continue

        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        # Route to appropriate scorer based on preference type
        if pref_type == 'FIRST_HOUR' and role:
            terms.extend(_first_hour_preference(
                solver, crew_id, role, shift_start_slot, 
                base_weight, crew_weight, adaptive_boost
            ))
        elif pref_type == 'FAVORITE' and role:
            terms.extend(_favorite_preference(
                solver, crew_id, role, shift_start_slot, shift_end_slot,
                base_weight, crew_weight, adaptive_boost
            ))
        elif pref_type == 'CONSECUTIVE' and role:
            terms.extend(_consecutive_preference(
                solver, crew_id, role, shift_start_slot, shift_end_slot,
                base_weight, crew_weight, adaptive_boost
            ))
        elif pref_type == 'TIMING' and int_value is not None:
            terms.extend(_timing_preference(
                solver, crew_id, int_value, shift_start_slot, shift_end_slot,
                base_weight, crew_weight, adaptive_boost
            ))

    # Domain-specific objectives (not preference-based)
    terms.extend(_parking_distance_preference(solver))
    terms.extend(_consecutive_role_penalty(solver))

    if terms:
        solver.model.Maximize(sum(terms))
    else:
        solver.model.Maximize(sum(solver.x.values()))


def _first_hour_preference(
    solver: "LogbookSolver",
    crew_id: str,
    role: str,
    shift_start_slot: int,
    base_weight: float,
    crew_weight: float,
    adaptive_boost: float
) -> List:
    """Score FIRST_HOUR preference - crew gets preferred role in first slot."""
    effective_weight = _combine_weights(base_weight, crew_weight, adaptive_boost)
    if effective_weight <= 0:
        return []

    key = (crew_id, shift_start_slot, role)
    if key in solver.x:
        return [effective_weight * solver.x[key]]
    return []


def _favorite_preference(
    solver: "LogbookSolver",
    crew_id: str,
    role: str,
    shift_start_slot: int,
    shift_end_slot: int,
    base_weight: float,
    crew_weight: float,
    adaptive_boost: float
) -> List:
    """Score FAVORITE preference - reward time spent on preferred role."""
    effective_weight = _combine_weights(base_weight, crew_weight, adaptive_boost)
    if effective_weight <= 0:
        return []

    role_slots = [
        solver.x[(crew_id, s, role)]
        for s in range(shift_start_slot, shift_end_slot)
        if (crew_id, s, role) in solver.x
    ]

    if role_slots:
        return [effective_weight * sum(role_slots)]
    return []


def _consecutive_preference(
    solver: "LogbookSolver",
    crew_id: str,
    role: str,
    shift_start_slot: int,
    shift_end_slot: int,
    base_weight: float,
    crew_weight: float,
    adaptive_boost: float
) -> List:
    """Score CONSECUTIVE preference - penalize role switches."""
    effective_weight = _combine_weights(base_weight, crew_weight, adaptive_boost)
    if effective_weight <= 0 or role not in solver.roles:
        return []

    terms = []
    for slot in range(shift_start_slot, shift_end_slot - 1):
        key_s = (crew_id, slot, role)
        key_s1 = (crew_id, slot + 1, role)
        if key_s in solver.x and key_s1 in solver.x:
            switch_var = solver.model.NewBoolVar(f'switch_{role}_{crew_id}_{slot}')
            x_s = solver.x[key_s]
            x_s1 = solver.x[key_s1]
            solver.model.Add(switch_var >= x_s - x_s1)
            solver.model.Add(switch_var >= x_s1 - x_s)
            terms.append(-effective_weight * switch_var)
    return terms


def _timing_preference(
    solver: "LogbookSolver",
    crew_id: str,
    timing_value: int,  # -1 = earlier, +1 = later
    shift_start_slot: int,
    shift_end_slot: int,
    base_weight: float,
    crew_weight: float,
    adaptive_boost: float
) -> List:
    """Score TIMING preference - prefer break earlier or later in shift."""
    break_roles = [r for r in solver._break_roles() if r in solver.roles]
    if not break_roles or timing_value == 0:
        return []

    break_role = break_roles[0]
    earliest_break_slot, latest_break_slot = solver._break_window_for_shift(
        shift_start_slot, shift_end_slot
    )
    latest_break_slot = min(latest_break_slot, shift_end_slot - 1)
    if earliest_break_slot >= latest_break_slot:
        return []

    max_offset = latest_break_slot - earliest_break_slot
    if max_offset <= 0:
        return []

    effective_weight = _combine_weights(base_weight, crew_weight, adaptive_boost)
    if effective_weight <= 0:
        return []

    terms = []
    for slot in range(earliest_break_slot, latest_break_slot + 1):
        key = (crew_id, slot, break_role)
        if key not in solver.x:
            continue
        offset = slot - earliest_break_slot
        if timing_value > 0:  # Prefer later
            score = (offset / max_offset) * effective_weight
        else:  # Prefer earlier
            score = ((max_offset - offset) / max_offset) * effective_weight
        terms.append(score * solver.x[key])
    return terms


def _parking_distance_preference(solver: "LogbookSolver") -> List:
    """Domain-specific: Push parking helm away from first hour."""
    parking_roles = [r for r in solver._parking_roles() if r in solver.roles]
    if not parking_roles:
        return []

    terms = []
    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        if not crew.get('canParkingHelms', True):
            continue

        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        for role in parking_roles:
            for slot in range(shift_start_slot + 2, shift_end_slot):
                key = (crew_id, slot, role)
                if key not in solver.x:
                    continue
                distance = slot - shift_start_slot
                max_distance = shift_end_slot - shift_start_slot - 1
                if max_distance <= 0:
                    continue
                penalty_weight = 50
                normalized_distance = distance / max_distance
                score = normalized_distance * penalty_weight
                terms.append(score * solver.x[key])
    return terms


def _combine_weights(
    base_weight: float, 
    crew_weight: float | None, 
    adaptive_boost: float = 1.0,
    default_multiplier: float = 1.0
) -> float:
    """
    Calculate effective weight using 3-component formula:
    effective_weight = baseWeight × crewWeight × adaptiveBoost
    
    Args:
        base_weight: Base weight from role preference (store-level default)
        crew_weight: Crew-specific weight multiplier (how much this crew cares)
        adaptive_boost: Dynamic boost based on historical satisfaction (default 1.0)
        default_multiplier: Default crew component if crew_weight is None
    
    Returns:
        Combined weight score
    """
    base_weight = base_weight or 0
    adaptive_boost = adaptive_boost or 1.0
    
    # Determine crew component
    if crew_weight is None:
        crew_component = default_multiplier
    elif crew_weight <= 0:
        return 0
    else:
        crew_component = crew_weight

    # Early exit if no base weight and no explicit crew preference
    if base_weight <= 0 and crew_weight is None:
        return 0
    
    # If only crew weight (no store base weight), return crew component
    if base_weight <= 0:
        return crew_component * adaptive_boost
    
    # Full formula: baseWeight × crewWeight × adaptiveBoost
    return base_weight * crew_component * adaptive_boost


def _consecutive_role_penalty(solver: "LogbookSolver") -> List:
    consecutive_roles = [
        role for role, meta in solver.role_meta_map.items()
        if meta.get('isConsecutive', False)
    ]
    terms = []
    for role in consecutive_roles:
        if role not in solver.roles:
            continue
        for crew_id in solver.crew_ids:
            crew = solver.crew_by_id[crew_id]
            shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes
            for slot in range(shift_start_slot, shift_end_slot - 1):
                key_s = (crew_id, slot, role)
                key_s1 = (crew_id, slot + 1, role)
                if key_s in solver.x and key_s1 in solver.x:
                    gap_var = solver.model.NewBoolVar(f'{role}_gap_{crew_id}_{slot}')
                    x_s = solver.x[key_s]
                    x_s1 = solver.x[key_s1]
                    solver.model.Add(gap_var >= x_s - x_s1)
                    solver.model.Add(gap_var >= x_s1 - x_s)
                    terms.append(-500 * gap_var)
    return terms
