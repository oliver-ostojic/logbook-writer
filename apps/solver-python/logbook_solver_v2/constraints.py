"""Constraint hooks for SolverV2."""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from .solver_v2 import SolverV2


def add_all(solver: "SolverV2") -> None:
    """Attach every hard constraint to the model."""

    _one_task_per_slot(solver)
    _hourly_staffing(solver)
    _daily_role_minutes(solver)
    _window_coverage(solver)


def _one_task_per_slot(solver: "SolverV2") -> None:
    m = solver.model
    for crew in solver.crew:
        crew_id = crew['id']
        shift_start_slot = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
        shift_end_slot = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])

        for slot in range(shift_start_slot, shift_end_slot):
            role_vars = solver.assignment_index.get((crew_id, slot))
            if not role_vars:
                continue
            m.Add(sum(var for _, var in role_vars) == 1)


def _hourly_staffing(solver: "SolverV2") -> None:
    if not solver.hourly_requirements:
        return

    m = solver.model
    slots_per_hour = solver.time_grid.slots_per_hour

    for req in solver.hourly_requirements:
        role_id = req['roleId']
        required = int(req.get('required', 0) or 0)
        hour = int(req['hour'])
        if required <= 0:
            continue

        hour_slots = range(hour * slots_per_hour, min((hour + 1) * slots_per_hour, solver.time_grid.num_slots))
        slot_vars = []
        for slot in hour_slots:
            for var_role_id, var in solver.assignment_index.get_by_slot(slot):
                if var_role_id == role_id:
                    slot_vars.append(var)

        if slot_vars:
            m.Add(sum(slot_vars) == required * slots_per_hour)


def _daily_role_minutes(solver: "SolverV2") -> None:
    if not solver.daily_requirements:
        return

    m = solver.model
    slot_minutes = solver.time_grid.slot_minutes

    # Pre-index variables per (crew, role)
    by_crew_role = defaultdict(list)
    for (crew_id, slot, role_id), var in solver.assignment_vars.items():
        by_crew_role[(crew_id, role_id)].append(var)

    for requirement in solver.daily_requirements:
        crew_id = requirement['crewId']
        role_id = requirement['roleId']
        required_minutes = requirement.get('requiredMinutes', 0)
        if required_minutes <= 0:
            continue
        required_slots = required_minutes // slot_minutes
        role_vars = by_crew_role.get((crew_id, role_id))
        if role_vars:
            m.Add(sum(role_vars) == required_slots)


def _window_coverage(solver: "SolverV2") -> None:
    if not solver.window_requirements:
        return

    m = solver.model
    slots_per_hour = solver.time_grid.slots_per_hour

    for window in solver.window_requirements:
        role_id = window['roleId']
        start_hour = window['startHour']
        end_hour = window['endHour']
        required = int(window.get('requiredPerHour', 0) or 0)
        if required <= 0:
            continue

        for hour in range(start_hour, end_hour):
            hour_slots = range(hour * slots_per_hour, min((hour + 1) * slots_per_hour, solver.time_grid.num_slots))
            slot_vars = []
            for slot in hour_slots:
                for var_role_id, var in solver.assignment_index.get_by_slot(slot):
                    if var_role_id == role_id:
                        slot_vars.append(var)
            if slot_vars:
                m.Add(sum(slot_vars) == required * slots_per_hour)


__all__ = ["add_all"]
