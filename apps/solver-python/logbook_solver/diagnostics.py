"""Diagnostics helpers for infeasibility detection."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from .core import LogbookSolver


def detect_violations(solver: "LogbookSolver") -> List[str]:
    """Heuristic violation detection when the CP-SAT model is infeasible."""

    violations: List[str] = []

    # Check 1: Hourly staffing availability vs required staffing (min over two slots)
    for req in solver.hourly_requirements:
        hour = req['hour']
        hour_slots = list(solver._hour_slots(hour))

        if req.get('requiredRegister', 0) > 0:
            _append_if_insufficient(violations, solver, hour, hour_slots, 'REGISTER', req['requiredRegister'])

        if req.get('requiredProduct', 0) > 0:
            _append_if_insufficient(violations, solver, hour, hour_slots, 'PRODUCT', req['requiredProduct'])

        if req.get('requiredParkingHelm', 0) > 0:
            _append_if_insufficient(violations, solver, hour, hour_slots, 'PARKING_HELM', req['requiredParkingHelm'])

    # Check 2: Crew role hours availability vs required hours
    slots_per_hour = 60 // solver.slot_minutes
    for req in solver.crew_role_requirements:
        crew_id = req['crewId']
        role = req['role']
        required_hours = req['requiredHours']
        required_slots = required_hours * slots_per_hour

        available_slots = sum(1 for s in solver.slots if (crew_id, s, role) in solver.x)

        if available_slots < required_slots:
            crew = solver.crew_by_id.get(crew_id)
            crew_name = crew['name'] if crew else crew_id
            violations.append(
                f"Crew {crew_name}: Need {required_hours} hours ({required_slots} slots) "
                f"on {role} but only {available_slots} slots available in shift."
            )

    # Check 3: Coverage windows availability
    for window in solver.coverage_windows:
        role = window['role']
        start_hour = window['startHour']
        end_hour = window['endHour']
        required_per_hour = window['requiredPerHour']

        for hour in range(start_hour, end_hour):
            for slot in solver._hour_slots(hour):
                available_crew = sum(1 for c in solver.crew_ids if (c, slot, role) in solver.x)
                if available_crew < required_per_hour:
                    violations.append(
                        f"{role} coverage window: Hour {hour} (slot {slot}) needs "
                        f"{required_per_hour} crew but only {available_crew} available."
                    )

    # Check 4: Meal break feasibility window
    break_roles = [r for r in solver._break_roles() if r in solver.roles]
    if break_roles:
        break_role = break_roles[0]
        min_shift_slots_for_break = solver._min_shift_slots_for_break()
        for crew_id in solver.crew_ids:
            crew = solver.crew_by_id[crew_id]
            if not crew.get('canBreak', True):
                continue

            shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes
            shift_length_slots = shift_end_slot - shift_start_slot

            if shift_length_slots >= min_shift_slots_for_break:
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

    return violations or [
        "Model is infeasible but specific violations could not be determined"
    ]


def _append_if_insufficient(
    violations: List[str],
    solver: "LogbookSolver",
    hour: int,
    hour_slots: List[int],
    role: str,
    required: int,
) -> None:
    if not hour_slots:
        return
    available = min(
        sum(1 for c in solver.crew_ids if (c, slot, role) in solver.x)
        for slot in hour_slots
    )
    if available < required:
        violations.append(
            f"Hour {hour}: Need {required} {role} crew but only {available} available "
            "in at least one store slot."
        )
