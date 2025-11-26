"""Hard constraints for the LogbookSolver."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - for type checking only
    from .core import LogbookSolver


def add_all_constraints(solver: "LogbookSolver") -> None:
    """Attach all hard constraints to the solver model."""

    _one_task_per_slot(solver)
    _store_hours(solver)
    _hourly_staffing_requirements(solver)
    _parking_first_hour(solver)
    _crew_role_requirements(solver)
    _coverage_windows(solver)
    _role_min_max(solver)
    _meal_breaks(solver)
    _block_size_snap(solver)  # Enforces blockSize for all roles
    _consecutive_slots(solver)


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


def _store_hours(solver: "LogbookSolver") -> None:
    """Prevent assignments outside store hours unless role explicitly allows it."""
    m = solver.model
    
    open_min = solver.store.get('openMinutesFromMidnight')
    close_min = solver.store.get('closeMinutesFromMidnight')
    
    if open_min is None or close_min is None:
        return  # No store hours defined
    
    open_slot = open_min // solver.slot_minutes
    close_slot = close_min // solver.slot_minutes
    
    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes
        
        for slot in range(shift_start_slot, shift_end_slot):
            # Slots outside store hours
            if slot < open_slot or slot >= close_slot:
                for role in solver.roles:
                    role_meta = solver.role_meta_map.get(role, {})
                    # Only allow if role explicitly permits outside hours
                    if not role_meta.get('allowOutsideStoreHours', False):
                        key = (crew_id, slot, role)
                        if key in solver.x:
                            m.Add(solver.x[key] == 0)


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
    """
    Enforce crew-specific role hour requirements.
    Crew WITH requirements get exactly the required hours.
    Crew WITHOUT requirements don't get variables created (see core.py _build_decision_variables)
    """
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
    """
    Enforce coverage window requirements: specific number of crew during time window.
    Coverage window roles are restricted to ONLY be assigned during their window
    (see _build_decision_variables in core.py).
    
    TODO: Test with requiredPerHour > 1 to ensure multiple crew can be assigned
          simultaneously to the same coverage window role.
    """
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
    """
    Enforce total time bounds per crew per role.
    Uses Role.minSlots and Role.maxSlots from database.
    
    Note: Break roles are excluded because they have special handling in _meal_breaks.
    """
    m = solver.model
    slots_per_hour = 60 // solver.slot_minutes

    for role in solver.roles:
        # Skip break roles - they have special handling in _meal_breaks
        if solver._is_break_role(role):
            continue
        
        role_meta = solver.role_meta_map.get(role, {})
        
        # Primary: Use minSlots/maxSlots from database (already in slot units)
        role_min_slots = role_meta.get('minSlots')
        role_max_slots = role_meta.get('maxSlots')
        
        # Fallback: Support legacy minMinutesPerCrew/maxMinutesPerCrew if provided
        if role_min_slots is None:
            role_min_minutes = role_meta.get('minMinutesPerCrew')
            role_min_slots = _minutes_to_slots(role_min_minutes, solver, rounding='ceil')
        
        if role_max_slots is None:
            role_max_minutes = role_meta.get('maxMinutesPerCrew')
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


def _block_size_snap(solver: "LogbookSolver") -> None:
    """
    Enforce blockSize constraints for roles.
    
    For a role with blockSize=N, assignments must be in multiples of N slots.
    - blockSize=1: Any number of slots allowed (30min, 1hr, 1.5hr, etc.)
    - blockSize=2: Must be 2-slot increments (1hr, 2hr, 3hr if baseSlotMinutes=30)
    - blockSize=4: Must be 4-slot increments (2hr, 4hr, 6hr if baseSlotMinutes=30)
    
    Strategy: For each block of blockSize consecutive slots, either ALL are assigned
    or NONE are assigned. This forces assignments to snap to blockSize boundaries.
    """
    m = solver.model

    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
        shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes

        for role in solver.roles:
            role_meta = solver.role_meta_map.get(role, {})
            block_size = role_meta.get('blockSize', 1)
            
            # blockSize=1 means no snapping needed (any combination allowed)
            if block_size <= 1:
                continue
            
            # For each potential block of blockSize slots
            slot = shift_start_slot
            while slot + block_size <= shift_end_slot:
                # Collect all vars in this block
                block_vars = []
                for offset in range(block_size):
                    key = (crew_id, slot + offset, role)
                    if key in solver.x:
                        block_vars.append(solver.x[key])
                
                # If we have a full block, enforce all-or-nothing
                if len(block_vars) == block_size:
                    # All vars in block must be equal (all 0 or all 1)
                    for var in block_vars[1:]:
                        m.Add(var == block_vars[0])
                
                slot += block_size


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


def _consecutive_slots(solver: "LogbookSolver") -> None:
    """
    Enforce slotsMustBeConsecutive for roles that require it.
    
    If a role has slotsMustBeConsecutive=true, all assignments for that role
    must form a single consecutive block with no gaps.
    
    This is a HARD constraint (unlike _consecutive_role_penalty which is soft).
    """
    m = solver.model
    
    # Find roles that require consecutive slots
    consecutive_roles = [
        role for role, meta in solver.role_meta_map.items()
        if meta.get('slotsMustBeConsecutive', False)
    ]
    
    if not consecutive_roles:
        return  # No roles require consecutive slots
    
    for role in consecutive_roles:
        if role not in solver.roles:
            continue
            
        for crew_id in solver.crew_ids:
            crew = solver.crew_by_id[crew_id]
            shift_start_slot = crew['shiftStartMin'] // solver.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // solver.slot_minutes
            
            # Collect all possible assignments for this crew+role
            role_vars = []
            for slot in range(shift_start_slot, shift_end_slot):
                key = (crew_id, slot, role)
                if key in solver.x:
                    role_vars.append((slot, solver.x[key]))
            
            if len(role_vars) <= 1:
                continue  # 0 or 1 assignment is always consecutive
            
            # Ensure consecutive: if slot S is assigned AND slot S+2 is assigned,
            # then slot S+1 MUST also be assigned (no gaps)
            for i in range(len(role_vars) - 1):
                slot_i, var_i = role_vars[i]
                slot_next, var_next = role_vars[i + 1]
                
                # Check if these slots are adjacent (diff of 1)
                if slot_next == slot_i + 1:
                    continue  # Adjacent slots, no constraint needed
                
                # Non-adjacent: if both are assigned, it's a gap (violation)
                # Constraint: var_i + var_next <= 1 (can't both be 1)
                # This prevents gaps by disallowing non-adjacent assignments
                m.Add(var_i + var_next <= 1)



