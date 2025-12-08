"""Diagnostics helpers for infeasibility detection."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import DefaultDict, Dict, List, TYPE_CHECKING

from .constraints import _balanced_block_distribution, _get_role_meta

if TYPE_CHECKING:  # pragma: no cover
    from .core import LogbookSolver


def detect_violations(solver: "LogbookSolver") -> List[str]:
    """Heuristic violation detection when the CP-SAT model is infeasible."""

    availability = _build_slot_role_availability(solver)
    crew_role_slots = _build_crew_role_slots(availability)
    slot_role_presence = _build_slot_role_presence(solver)

    violations: List[str] = []

    _check_slot_role_coverage(solver, slot_role_presence, violations)
    _check_balanced_hourly_requirements(solver, availability, violations)
    _check_crew_role_requirements(solver, crew_role_slots, violations)
    _check_coverage_windows(solver, availability, violations)
    _check_meal_break_feasibility(solver, violations)
    _check_role_slot_bounds_and_blocking(solver, crew_role_slots, violations)
    _check_shift_time_budget(solver, crew_role_slots, violations)
    _check_total_role_capacity(solver, crew_role_slots, violations)

    return violations or [
        "Model is infeasible but specific violations could not be determined"
    ]


def _check_balanced_hourly_requirements(
    solver: "LogbookSolver",
    availability: Dict[tuple[int, str], List[str]],
    violations: List[str],
) -> None:
    slots_per_hour = solver.slots_per_hour

    def _check(role: str, required_per_hour: int, hour: int) -> None:
        if required_per_hour <= 0:
            return

        block_size = _role_block_size(solver, role)
        block_requirements = _balanced_block_distribution(
            required_per_hour, slots_per_hour, block_size, role
        )
        hour_start_slot = hour * slots_per_hour

        for block_index, block_requirement in enumerate(block_requirements):
            if block_requirement == 0:
                continue

            block_slots = range(
                hour_start_slot + block_index * block_size,
                hour_start_slot + (block_index + 1) * block_size,
            )

            shortage = _slot_shortage(block_slots, role, block_requirement, availability, solver)
            if shortage is None:
                continue

            slot, available = shortage
            violations.append(
                f"Hour {hour}: {role} block {block_index + 1} needs {block_requirement} crew but only "
                f"{available} available (slot {slot}, {_format_slot_label(solver, slot)})."
            )
            break

    for requirement in solver.hourly_requirements:
        hour = requirement.get('hour')
        if hour is None:
            continue

        _check('REGISTER', int(requirement.get('requiredRegister', 0) or 0), hour)
        _check('PRODUCT', int(requirement.get('requiredProduct', 0) or 0), hour)
        _check('PARKING_HELM', int(requirement.get('requiredParkingHelm', 0) or 0), hour)


def _check_crew_role_requirements(
    solver: "LogbookSolver",
    crew_role_slots: Dict[str, Dict[str, List[int]]],
    violations: List[str],
) -> None:
    slots_per_hour = solver.slots_per_hour

    for (crew_id, role), required_hours in solver._crew_daily_requirements.items():
        required_slots = int(round(required_hours * slots_per_hour))
        if required_slots <= 0:
            continue

        crew = solver.crew_by_id.get(crew_id)
        crew_name = crew.get('name', crew_id) if crew else crew_id
        slot_list = crew_role_slots.get(crew_id, {}).get(role, [])

        if not slot_list:
            violations.append(
                f"Crew {crew_name}: requires {required_slots} slots on {role} but has no eligible slots "
                "inside their shift."
            )
            continue

        if len(slot_list) < required_slots:
            violations.append(
                f"Crew {crew_name}: {role} requires {required_slots} slots but only {len(slot_list)} slots exist "
                "within the shift."
            )

        block_size = _role_block_size(solver, role)
        if block_size > 1:
            block_capacity = _max_block_assignable(slot_list, block_size)
            if block_capacity < required_slots:
                violations.append(
                    f"Crew {crew_name}: {role} requires contiguous blocks of {block_size} slots but only "
                    f"{block_capacity} slots can be formed (needs {required_slots})."
                )

        if crew:
            effective_max = _crew_role_max_slots(solver, crew, role)
            if effective_max is not None and required_slots > effective_max:
                violations.append(
                    f"Crew {crew_name}: {role} requirement ({required_slots} slots) exceeds maxSlots limit "
                    f"of {effective_max}."
                )


def _check_coverage_windows(
    solver: "LogbookSolver",
    availability: Dict[tuple[int, str], List[str]],
    violations: List[str],
) -> None:
    slots_per_hour = solver.slots_per_hour

    for window in solver.coverage_windows:
        role = window['role']
        required_per_hour = int(window.get('requiredPerHour', 0) or 0)
        if required_per_hour <= 0:
            continue

        block_size = _role_block_size(solver, role)
        block_requirements = _balanced_block_distribution(required_per_hour, slots_per_hour, block_size, role)

        for hour in range(window['startHour'], window['endHour']):
            hour_start_slot = hour * slots_per_hour

            for block_index, block_requirement in enumerate(block_requirements):
                if block_requirement == 0:
                    continue

                block_slots = range(
                    hour_start_slot + block_index * block_size,
                    hour_start_slot + (block_index + 1) * block_size,
                )

                shortage = _slot_shortage(block_slots, role, block_requirement, availability, solver)
                if shortage is not None:
                    slot, available = shortage
                    violations.append(
                        f"Coverage window [{window['startHour']}, {window['endHour']}): role {role} "
                        f"block {block_index + 1} at hour {hour} needs {block_requirement} crew "
                        f"but only {available} available (slot {slot}, { _format_slot_label(solver, slot)})."
                    )
                    break


def _check_meal_break_feasibility(solver: "LogbookSolver", violations: List[str]) -> None:
    break_roles = [r for r in solver._break_roles() if r in solver.roles]
    if not break_roles:
        return

    break_role = break_roles[0]
    min_shift_slots_for_break = solver._min_shift_slots_for_break()

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        if not crew.get('canBreak', True):
            continue

        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes
        shift_length_slots = shift_end_slot - shift_start_slot

        if shift_length_slots < min_shift_slots_for_break:
            continue

        earliest_break_slot, latest_break_slot = solver._break_window_for_shift(
            shift_start_slot, shift_end_slot
        )
        latest_break_slot = min(latest_break_slot, shift_end_slot - 1)

        has_break_vars = any(
            (crew_id, s, break_role) in solver.x
            for s in range(earliest_break_slot, latest_break_slot + 1)
        )
        if not has_break_vars:
            crew_name = crew.get('name', crew_id)
            violations.append(
                f"Crew {crew_name}: Cannot schedule required meal break in "
                f"valid slots {earliest_break_slot}-{latest_break_slot}."
            )


def _check_role_slot_bounds_and_blocking(
    solver: "LogbookSolver",
    crew_role_slots: Dict[str, Dict[str, List[int]]],
    violations: List[str],
) -> None:
    slots_per_hour = solver.slots_per_hour

    for role in solver.roles:
        if solver._is_break_role(role):
            continue

        role_meta = solver.role_meta_map.get(role, {})
        block_size = max(1, int(role_meta.get('blockSize', 1) or 1))

        role_min_slots = role_meta.get('minSlots')
        role_max_slots = role_meta.get('maxSlots')

        if role_min_slots is None:
            role_min_slots = _minutes_to_slots(role_meta.get('minMinutesPerCrew'), solver, 'ceil')
        if role_max_slots is None:
            role_max_slots = _minutes_to_slots(role_meta.get('maxMinutesPerCrew'), solver, 'floor')

        for crew_id in solver.crew_ids:
            crew = solver.crew_by_id[crew_id]
            slot_indices = crew_role_slots.get(crew_id, {}).get(role, [])

            if not slot_indices:
                continue

            crew_min_slots = None
            crew_max_slots = None

            if role == 'REGISTER':
                min_hours = crew.get('minRegisterHours')
                max_hours = crew.get('maxRegisterHours')

                if min_hours is not None and min_hours > 0:
                    crew_min_slots = math.ceil(min_hours * slots_per_hour - 1e-9)

                if max_hours is not None and max_hours >= 0:
                    crew_max_slots = math.floor(max_hours * slots_per_hour + 1e-9)

            effective_min = _max_defined_slot_requirement(crew_min_slots, role_min_slots)
            effective_max = _min_defined_slot_requirement(crew_max_slots, role_max_slots)

            if (
                effective_min is not None
                and effective_max is not None
                and effective_min > effective_max
            ):
                crew_name = crew.get('name', crew_id)
                violations.append(
                    f"{crew_name}: {role} minSlots={effective_min} exceeds maxSlots={effective_max}, "
                    "so the requirements cannot be satisfied."
                )
                continue

            min_requirement = None
            if effective_min is not None:
                min_requirement = min(effective_min, len(slot_indices))

            if block_size > 1 and min_requirement:
                block_capacity = _max_block_assignable(slot_indices, block_size)
                if block_capacity < min_requirement:
                    crew_name = crew.get('name', crew_id)
                    violations.append(
                        f"{crew_name}: {role} needs blocks of {block_size} slots, but only "
                        f"{block_capacity} consecutive slots can be formed (needs {min_requirement})."
                    )



def _check_shift_time_budget(
    solver: "LogbookSolver",
    crew_role_slots: Dict[str, Dict[str, List[int]]],
    violations: List[str],
) -> None:
    """Ensure each crew's minimum role time can fit inside their shift."""

    slots_per_hour = solver.slots_per_hour

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))
        shift_slots = max(0, shift_end - shift_start)
        if shift_slots == 0:
            continue

        min_demand = 0
        details: List[str] = []

        for (req_crew_id, role), required_hours in solver._crew_daily_requirements.items():
            if req_crew_id != crew_id:
                continue

            required_slots = int(round(required_hours * slots_per_hour))
            if required_slots <= 0:
                continue

            min_demand += required_slots
            details.append(f"{role} daily={required_slots}")

        role_map = crew_role_slots.get(crew_id, {})
        for role, role_meta in solver.role_meta_map.items():
            slot_indices = role_map.get(role, [])
            if not slot_indices:
                continue

            role_min_slots = role_meta.get('minSlots')
            if role_min_slots is None:
                role_min_slots = _minutes_to_slots(role_meta.get('minMinutesPerCrew'), solver, 'ceil')

            crew_min_slots = None
            if role == 'REGISTER':
                min_hours = crew.get('minRegisterHours')
                if min_hours is not None and min_hours > 0:
                    crew_min_slots = math.ceil(min_hours * slots_per_hour - 1e-9)

            effective_min = _max_defined_slot_requirement(role_min_slots, crew_min_slots)
            if effective_min:
                min_demand += effective_min
                details.append(f"{role} minSlots={effective_min}")

        if min_demand <= shift_slots + 1e-9:
            continue

        crew_name = crew.get('name', crew_id)
        shift_hours = shift_slots / slots_per_hour
        demand_hours = min_demand / slots_per_hour
        detail_text = ", ".join(details[:4])
        if len(details) > 4:
            detail_text += ", ..."

        violations.append(
            f"Crew {crew_name}: total minimum role time {demand_hours:.1f}h exceeds shift length "
            f"{shift_hours:.1f}h ({detail_text})."
        )


def _check_total_role_capacity(
    solver: "LogbookSolver",
    crew_role_slots: Dict[str, Dict[str, List[int]]],
    violations: List[str],
) -> None:
    """Ensure each crew has enough role capacity (respecting maxSlots/blockSize) to cover their shift."""

    slots_per_hour = solver.slots_per_hour

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end_slot = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))
        shift_slots = max(0, shift_end_slot - shift_start_slot)
        if shift_slots == 0:
            continue

        role_map = crew_role_slots.get(crew_id, {})
        total_capacity = 0
        contributions: List[tuple[str, int]] = []

        for role, slot_indices in role_map.items():
            if not slot_indices:
                continue

            block_size = _role_block_size(solver, role)
            contiguous_capacity = len(slot_indices)
            if block_size > 1:
                contiguous_capacity = _max_block_assignable(slot_indices, block_size)

            effective_max = _crew_role_max_slots(solver, crew, role)
            if effective_max is not None:
                contiguous_capacity = min(contiguous_capacity, effective_max)

            if contiguous_capacity <= 0:
                continue

            total_capacity += contiguous_capacity
            contributions.append((role, contiguous_capacity))

        if total_capacity + 1e-9 >= shift_slots:
            continue

        missing_slots = shift_slots - total_capacity
        crew_name = crew.get('name', crew_id)
        shift_hours = shift_slots / slots_per_hour
        capacity_hours = total_capacity / slots_per_hour
        missing_hours = missing_slots / slots_per_hour

        contribution_text = ", ".join(
            f"{role}≤{slots / slots_per_hour:.1f}h"
            for role, slots in sorted(contributions, key=lambda item: -item[1])[:4]
        )
        if not contribution_text:
            contribution_text = "no eligible roles"

        violations.append(
            f"Crew {crew_name}: shift is {shift_hours:.1f}h but role capacity (respecting maxSlots/blockSize) totals "
            f"only {capacity_hours:.1f}h ({contribution_text}). Missing {missing_hours:.1f}h of coverage."
        )


def _check_slot_role_coverage(
    solver: "LogbookSolver",
    slot_role_presence: Dict[tuple[str, int], int],
    violations: List[str],
) -> None:
    """Ensure every crew slot inside their shift has at least one role variable."""

    if not slot_role_presence:
        return

    universal_roles = sorted((solver._hourly_roles | getattr(solver, '_none_roles', set())) or [])

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        crew_name = crew.get('name', crew_id)
        shift_start_slot = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end_slot = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))

        for slot in range(shift_start_slot, shift_end_slot):
            if slot >= solver.num_slots:
                break

            if slot_role_presence.get((crew_id, slot)):
                continue

            # Ignore slots that lie completely outside store hours
            if not solver._slot_inside_store_hours(slot):
                continue

            slot_label = _format_slot_label(solver, slot)
            if universal_roles:
                role_text = ", ".join(universal_roles)
                msg = (
                    f"Crew {crew_name}: slot {slot_label} has no available roles even though universal roles "
                    f"({role_text}) should provide filler coverage."
                )
            else:
                msg = f"Crew {crew_name}: slot {slot_label} has no available roles at all."

            violations.append(msg)


def _build_slot_role_availability(
    solver: "LogbookSolver",
) -> Dict[tuple[int, str], List[str]]:
    """Return per-slot, per-role crew availability honoring deterministic bans."""

    availability: DefaultDict[tuple[int, str], List[str]] = defaultdict(list)
    crew_shift_meta = {}

    for crew in solver.crew:
        crew_id = crew['id']
        shift_start_slot = solver._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
        shift_end_slot = solver._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60))
        first_hour_cutoff = min(shift_start_slot + solver.slots_per_hour, shift_end_slot)
        crew_shift_meta[crew_id] = (shift_start_slot, shift_end_slot, first_hour_cutoff)

    for (crew_id, slot, role), _var in solver.x.items():
        start_slot, end_slot, first_hour_cutoff = crew_shift_meta[crew_id]
        if solver._is_parking_role(role) and start_slot <= slot < first_hour_cutoff:
            continue

        if slot < start_slot or slot >= end_slot:
            continue

        availability[(slot, role)].append(crew_id)

    return availability


def _build_crew_role_slots(
    availability: Dict[tuple[int, str], List[str]]
) -> Dict[str, Dict[str, List[int]]]:
    crew_role_slots: DefaultDict[str, DefaultDict[str, List[int]]] = defaultdict(lambda: defaultdict(list))
    for (slot, role), crew_ids in availability.items():
        for crew_id in crew_ids:
            crew_role_slots[crew_id][role].append(slot)

    for crew_id in crew_role_slots:
        for role in crew_role_slots[crew_id]:
            crew_role_slots[crew_id][role].sort()

    return crew_role_slots


def _build_slot_role_presence(
    solver: "LogbookSolver",
) -> Dict[tuple[str, int], int]:
    presence: DefaultDict[tuple[str, int], int] = defaultdict(int)
    for (crew_id, slot, _role), _var in solver.x.items():
        presence[(crew_id, slot)] += 1
    return presence


def _slot_shortage(
    block_slots: range,
    role: str,
    block_requirement: int,
    availability: Dict[tuple[int, str], List[str]],
    solver: "LogbookSolver",
) -> tuple[int, int] | None:
    for slot in block_slots:
        if slot >= solver.num_slots:
            continue
        available = len(availability.get((slot, role), []))
        if available < block_requirement:
            return slot, available
    return None


def _crew_role_max_slots(solver: "LogbookSolver", crew: Dict, role: str) -> int | None:
    role_meta = solver.role_meta_map.get(role, {})
    role_max_slots = role_meta.get('maxSlots')
    if role_max_slots is None:
        role_max_slots = _minutes_to_slots(role_meta.get('maxMinutesPerCrew'), solver, 'floor')

    if role == 'REGISTER':
        max_hours = crew.get('maxRegisterHours')
        if max_hours is not None and max_hours >= 0:
            crew_max_slots = math.floor(max_hours * solver.slots_per_hour + 1e-9)
            return _min_defined_slot_requirement(crew_max_slots, role_max_slots)

    return role_max_slots


def _role_block_size(solver: "LogbookSolver", role: str) -> int:
    meta = _get_role_meta(solver, role) or {}
    try:
        block_size = int(meta.get('blockSize', 1) or 1)
    except (TypeError, ValueError):
        block_size = 1
    return max(1, block_size)


def _format_slot_label(solver: "LogbookSolver", slot: int) -> str:
    minutes = solver._slot_start_minute(slot)
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"


def _minutes_to_slots(minutes: int | None, solver: "LogbookSolver", rounding: str) -> int | None:
    if minutes is None:
        return None
    slots = minutes / solver.slot_minutes
    if rounding == 'ceil':
        return math.ceil(slots - 1e-9)
    return math.floor(slots + 1e-9)


def _max_defined_slot_requirement(*values: int | None) -> int | None:
    defined = [v for v in values if v is not None]
    return max(defined) if defined else None


def _min_defined_slot_requirement(*values: int | None) -> int | None:
    defined = [v for v in values if v is not None]
    return min(defined) if defined else None


def _max_block_assignable(slot_indices: List[int], block_size: int) -> int:
    if not slot_indices:
        return 0

    capacity = 0
    run_length = 1
    previous = slot_indices[0]

    for slot in slot_indices[1:]:
        if slot == previous + 1:
            run_length += 1
        else:
            capacity += (run_length // block_size) * block_size
            run_length = 1
        previous = slot

    capacity += (run_length // block_size) * block_size
    return capacity
