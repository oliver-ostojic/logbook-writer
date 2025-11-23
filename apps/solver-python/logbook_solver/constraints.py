"""Hard constraints for the LogbookSolver."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - for type checking only
    from .core import LogbookSolver


def add_all_constraints(solver: "LogbookSolver") -> None:
    """Attach all hard constraints to the solver model."""

    _one_task_per_slot(solver)
    _hourly_staffing_requirements(solver)
    _parking_first_hour(solver)
    _crew_role_requirements(solver)
    _coverage_windows(solver)
    _role_min_max(solver)
    _meal_breaks(solver)
    _hour_long_roles_snap(solver)


def _one_task_per_slot(solver: "LogbookSolver") -> None:
    m = solver.model
    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        for slot in range(shift_start_slot, shift_end_slot):
            role_vars = [
                solver.x[(crew_id, slot, role)]
                for role in solver.roles
                if (crew_id, slot, role) in solver.x
            ]
            if role_vars:
                m.Add(sum(role_vars) == 1)


def _hourly_staffing_requirements(solver: "LogbookSolver") -> None:
    m = solver.model
    slots_per_hour = solver.slots_per_hour
    for req in solver.hourly_requirements:
        hour = req['hour']
        start_slot = hour * slots_per_hour
        hour_slots = list(range(start_slot, min(start_slot + slots_per_hour, solver.num_slots)))

        if req.get('requiredRegister', 0) > 0:
            _enforce_hourly_role(solver, m, hour_slots, 'REGISTER', req['requiredRegister'])

        if req.get('requiredProduct', 0) > 0:
            _enforce_hourly_role(solver, m, hour_slots, 'PRODUCT', req['requiredProduct'])

        if req.get('requiredParkingHelm', 0) > 0:
            _enforce_hourly_role(solver, m, hour_slots, 'PARKING_HELM', req['requiredParkingHelm'])


def _enforce_hourly_role(solver: "LogbookSolver", m, hour_slots, role: str, required: int) -> None:
    for slot in hour_slots:
        role_vars = [
            solver.x[(c, slot, role)]
            for c in solver.crew_ids
            if (c, slot, role) in solver.x
        ]
        if not role_vars:
            raise ValueError(
                f"Hour slot {solver._slot_to_hour_index(slot)} (slot {slot}, minute {solver._slot_start_minute(slot)}): "
                f"role {role} requires {required} crew but no crew can be assigned."
            )
        m.Add(sum(role_vars) == required)


def _parking_first_hour(solver: "LogbookSolver") -> None:
    m = solver.model
    parking_roles = solver._parking_roles()

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        first_hour_slots = range(
            shift_start_slot,
            min(shift_start_slot + solver.slots_per_hour, shift_end_slot),
        )

        for slot in first_hour_slots:
            for role in parking_roles:
                key = (crew_id, slot, role)
                if key in solver.x:
                    m.Add(solver.x[key] == 0)


def _crew_role_requirements(solver: "LogbookSolver") -> None:
    m = solver.model
    slots_per_hour = 60 // solver.slot_minutes

    for req in solver.crew_role_requirements:
        crew_id = req['crewId']
        role = req['role']
        required_hours = req['requiredHours']
        required_slots = required_hours * slots_per_hour

        role_slots = [
            solver.x[(crew_id, s, role)]
            for s in solver.slots
            if (crew_id, s, role) in solver.x
        ]

        if required_slots > 0 and not role_slots:
            crew = solver.crew_by_id.get(crew_id)
            crew_name = crew['name'] if crew and 'name' in crew else crew_id
            raise ValueError(
                f"Crew {crew_name} (id={crew_id}): requiredHours={required_hours} "
                f"({required_slots} slots) on role {role} but has no available slots."
            )

        if required_slots > 0:
            m.Add(sum(role_slots) == required_slots)


def _coverage_windows(solver: "LogbookSolver") -> None:
    m = solver.model
    for window in solver.coverage_windows:
        role = window['role']
        start_hour = window['startHour']
        end_hour = window['endHour']
        required_per_hour = window['requiredPerHour']

        for hour in range(start_hour, end_hour):
            for slot in solver._hour_slots(hour):
                hour_coverage = [
                    solver.x[(c, slot, role)]
                    for c in solver.crew_ids
                    if (c, slot, role) in solver.x
                ]
                if required_per_hour > 0 and not hour_coverage:
                    raise ValueError(
                        f"Coverage window for {role}: hour {hour}, slot {slot} "
                        f"requires {required_per_hour} crew but no crew can be assigned."
                )
                m.Add(sum(hour_coverage) == required_per_hour)


def _role_min_max(solver: "LogbookSolver") -> None:
    m = solver.model
    slots_per_hour = 60 // solver.slot_minutes

    for role in solver.roles:
        role_meta = solver.role_meta_map.get(role, {})
        role_min_minutes = role_meta.get('minMinutesPerCrew')
        role_max_minutes = role_meta.get('maxMinutesPerCrew')

        role_min_slots = _minutes_to_slots(role_min_minutes, solver, rounding='ceil')
        role_max_slots = _minutes_to_slots(role_max_minutes, solver, rounding='floor')

        # Skip roles without any bounds defined (unless register uses crew overrides)
        if role_min_slots is None and role_max_slots is None and role != 'REGISTER':
            continue

        for crew_id in solver.crew_ids:
            crew = solver.crew_by_id[crew_id]
            role_vars = [
                solver.x[(crew_id, slot, role)]
                for slot in solver.slots
                if (crew_id, slot, role) in solver.x
            ]

            if not role_vars:
                continue

            total_role_slots = len(role_vars)
            crew_min_slots = None
            crew_max_slots = None

            # Legacy overrides only apply to REGISTER for backward compatibility
            if role == 'REGISTER':
                min_hours = crew.get('minRegisterHours')
                max_hours = crew.get('maxRegisterHours')

                if min_hours is not None and min_hours > 0:
                    crew_min_slots = math.ceil(min_hours * slots_per_hour - 1e-9)

                if max_hours is not None and max_hours >= 0:
                    crew_max_slots = math.floor(max_hours * slots_per_hour + 1e-9)

            effective_min = _max_defined_slot_requirement(crew_min_slots, role_min_slots)
            effective_max = _min_defined_slot_requirement(crew_max_slots, role_max_slots)

            if effective_min is not None:
                min_slots = min(effective_min, total_role_slots)
                m.Add(sum(role_vars) >= min_slots)

            if effective_max is not None:
                max_slots = min(effective_max, total_role_slots)
                m.Add(sum(role_vars) <= max_slots)


def _meal_breaks(solver: "LogbookSolver") -> None:
    m = solver.model
    break_roles = [r for r in solver._break_roles() if r in solver.roles]
    if not break_roles:
        return

    break_role = break_roles[0]
    min_shift_slots_for_break = solver._min_shift_slots_for_break()

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes
        shift_length_slots = shift_end_slot - shift_start_slot

        if not crew.get('canBreak', True):
            for slot in range(shift_start_slot, shift_end_slot):
                key = (crew_id, slot, break_role)
                if key in solver.x:
                    m.Add(solver.x[key] == 0)
            continue

        if shift_length_slots < min_shift_slots_for_break:
            for slot in range(shift_start_slot, shift_end_slot):
                key = (crew_id, slot, break_role)
                if key in solver.x:
                    m.Add(solver.x[key] == 0)
            continue

        earliest_break_slot, latest_break_slot = solver._break_window_for_shift(
            shift_start_slot, shift_end_slot
        )
        if latest_break_slot >= shift_end_slot:
            latest_break_slot = shift_end_slot - 1
        if earliest_break_slot > latest_break_slot:
            crew_name = crew.get('name', crew_id)
            raise ValueError(
                f"Crew {crew_name} (id={crew_id}): shift requires a meal break, "
                "but store break window leaves no valid slots."
            )

        break_vars = [
            solver.x[(crew_id, slot, break_role)]
            for slot in range(earliest_break_slot, latest_break_slot + 1)
            if (crew_id, slot, break_role) in solver.x
        ]

        if not break_vars:
            crew_name = crew.get('name', crew_id)
            raise ValueError(
                f"Crew {crew_name} (id={crew_id}): shift requires a meal break, "
                f"but no {break_role} assignment is possible in slots "
                f"{earliest_break_slot}-{latest_break_slot}."
            )

        m.Add(sum(break_vars) == 1)

        for slot in range(shift_start_slot, shift_end_slot):
            if slot < earliest_break_slot or slot > latest_break_slot:
                key = (crew_id, slot, break_role)
                if key in solver.x:
                    m.Add(solver.x[key] == 0)


def _hour_long_roles_snap(solver: "LogbookSolver") -> None:
    m = solver.model

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        slots_per_hour = solver.slots_per_hour
        first_hour_index = shift_start_slot // slots_per_hour
        last_hour_index = (shift_end_slot - 1) // slots_per_hour

        for hour in range(first_hour_index, last_hour_index + 1):
            slot1 = hour * slots_per_hour
            slot2 = slot1 + slots_per_hour - 1
            if slot1 < shift_start_slot or slot2 >= shift_end_slot:
                continue

            for role in solver.roles:
                if role in solver.half_hour_roles:
                    continue
                hour_slots = [slot1 + offset for offset in range(slots_per_hour)]
                hour_slots = [s for s in hour_slots if shift_start_slot <= s < shift_end_slot]
                if len(hour_slots) < slots_per_hour:
                    continue
                key_vars = [
                    solver.x[(crew_id, s, role)]
                    for s in hour_slots
                    if (crew_id, s, role) in solver.x
                ]
                if len(key_vars) == slots_per_hour:
                    for var in key_vars[1:]:
                        m.Add(var == key_vars[0])


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
