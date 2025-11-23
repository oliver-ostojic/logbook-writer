"""Objective construction for the LogbookSolver."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from .core import LogbookSolver


def add_objective(solver: "LogbookSolver") -> None:
    """Build and attach the weighted preference objective."""

    terms = []

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        terms.extend(_first_slot_preference(solver, crew_id, crew, shift_start_slot))
        terms.extend(_task_bias(solver, crew_id, crew, shift_start_slot, shift_end_slot))
        terms.extend(_product_switch_penalty(solver, crew_id, crew, shift_start_slot, shift_end_slot))
        terms.extend(_register_switch_penalty(solver, crew_id, crew, shift_start_slot, shift_end_slot))
        terms.extend(_break_timing_preference(solver, crew_id, crew, shift_start_slot, shift_end_slot))
        terms.extend(_parking_distance_preference(solver, crew_id, crew, shift_start_slot, shift_end_slot))

    terms.extend(_consecutive_role_penalty(solver))

    if terms:
        solver.model.Maximize(sum(terms))
    else:
        solver.model.Maximize(sum(solver.x.values()))


def _first_slot_preference(solver: "LogbookSolver", crew_id: str, crew, shift_start_slot: int) -> List:
    pref_first_role = crew.get('prefFirstHour')
    if not pref_first_role:
        return []

    store_weight = _first_hour_store_weight(solver, pref_first_role)
    crew_weight = crew.get('prefFirstHourWeight')
    effective_weight = _combine_weights(store_weight, crew_weight)
    if effective_weight > 0:
        key = (crew_id, shift_start_slot, pref_first_role)
        if key in solver.x:
            return [effective_weight * solver.x[key]]
    return []


def _task_bias(
    solver: "LogbookSolver",
    crew_id: str,
    crew,
    shift_start_slot: int,
    shift_end_slot: int,
) -> List:
    terms = []
    pref_task = crew.get('prefTask')
    if pref_task:
        store_weight = _task_store_weight(solver, pref_task)
        crew_weight = crew.get('prefTaskWeight')
        effective_weight = _combine_weights(store_weight, crew_weight)
        if effective_weight > 0:
            pref_task_slots = [
                solver.x[(crew_id, s, pref_task)]
                for s in range(shift_start_slot, shift_end_slot)
                if (crew_id, s, pref_task) in solver.x
            ]
            if pref_task_slots:
                terms.append(effective_weight * sum(pref_task_slots))
    return terms


def _product_switch_penalty(
    solver: "LogbookSolver",
    crew_id: str,
    crew,
    shift_start_slot: int,
    shift_end_slot: int,
) -> List:
    store_weight = solver.store.get('consecutiveProdWeight', 0)
    crew_weight = crew.get('consecutiveProdWeight')
    weight = _combine_weights(store_weight, crew_weight)
    if weight <= 0 or 'PRODUCT' not in solver.roles:
        return []

    terms = []
    for slot in range(shift_start_slot, shift_end_slot - 1):
        key_s = (crew_id, slot, 'PRODUCT')
        key_s1 = (crew_id, slot + 1, 'PRODUCT')
        if key_s in solver.x and key_s1 in solver.x:
            switch_var = solver.model.NewBoolVar(f'switch_prod_{crew_id}_{slot}')
            x_s = solver.x[key_s]
            x_s1 = solver.x[key_s1]
            solver.model.Add(switch_var >= x_s - x_s1)
            solver.model.Add(switch_var >= x_s1 - x_s)
            terms.append(-weight * switch_var)
    return terms


def _register_switch_penalty(
    solver: "LogbookSolver",
    crew_id: str,
    crew,
    shift_start_slot: int,
    shift_end_slot: int,
) -> List:
    store_weight = solver.store.get('consecutiveRegWeight', 0)
    crew_weight = crew.get('consecutiveRegWeight')
    weight = _combine_weights(store_weight, crew_weight)
    if weight <= 0 or 'REGISTER' not in solver.roles:
        return []

    terms = []
    for slot in range(shift_start_slot, shift_end_slot - 1):
        key_s = (crew_id, slot, 'REGISTER')
        key_s1 = (crew_id, slot + 1, 'REGISTER')
        if key_s in solver.x and key_s1 in solver.x:
            switch_var = solver.model.NewBoolVar(f'switch_reg_{crew_id}_{slot}')
            x_s = solver.x[key_s]
            x_s1 = solver.x[key_s1]
            solver.model.Add(switch_var >= x_s - x_s1)
            solver.model.Add(switch_var >= x_s1 - x_s)
            terms.append(-weight * switch_var)
    return terms


def _break_timing_preference(
    solver: "LogbookSolver",
    crew_id: str,
    crew,
    shift_start_slot: int,
    shift_end_slot: int,
) -> List:
    break_roles = [r for r in solver._break_roles() if r in solver.roles]
    if not break_roles:
        return []

    pref_break_timing = crew.get('prefBreakTiming', 0)
    if pref_break_timing == 0:
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

    store_break_weight = 0
    if pref_break_timing > 0:
        store_break_weight = solver.store.get('lateBreakWeight', 0)
    elif pref_break_timing < 0:
        store_break_weight = solver.store.get('earlyBreakWeight', 0)

    crew_weight = crew.get('prefBreakTimingWeight')
    effective_weight = _combine_weights(store_break_weight, crew_weight)
    if effective_weight <= 0:
        return []

    terms = []
    for slot in range(earliest_break_slot, latest_break_slot + 1):
        key = (crew_id, slot, break_role)
        if key not in solver.x:
            continue
        offset = slot - earliest_break_slot
        if pref_break_timing > 0:
            score = (offset / max_offset) * effective_weight
        else:
            score = ((max_offset - offset) / max_offset) * effective_weight
        terms.append(score * solver.x[key])
    return terms


def _parking_distance_preference(
    solver: "LogbookSolver",
    crew_id: str,
    crew,
    shift_start_slot: int,
    shift_end_slot: int,
) -> List:
    parking_roles = [r for r in solver._parking_roles() if r in solver.roles]
    if not parking_roles or not crew.get('canParkingHelms', True):
        return []

    terms = []
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


def _combine_weights(store_weight: float, crew_weight: float | None, default_multiplier: float = 1.0) -> float:
    store_weight = store_weight or 0
    if crew_weight is None:
        crew_component = default_multiplier
    elif crew_weight <= 0:
        return 0
    else:
        crew_component = crew_weight

    if store_weight <= 0 and crew_weight is None:
        return 0
    if store_weight <= 0:
        return crew_component
    return store_weight * crew_component


def _first_hour_store_weight(solver: "LogbookSolver", role: str) -> float:
    if role == 'PRODUCT':
        return solver.store.get('productFirstHourWeight', 0)
    if role == 'REGISTER':
        return solver.store.get('registerFirstHourWeight', 0)
    return 0


def _task_store_weight(solver: "LogbookSolver", role: str) -> float:
    if role == 'PRODUCT':
        return solver.store.get('productTaskWeight', 0)
    if role == 'REGISTER':
        return solver.store.get('registerTaskWeight', 0)
    return 0


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
