"""Decision variable construction for SolverV2."""

from __future__ import annotations

from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from .time_grid import TimeGrid

AssignmentKey = Tuple[str, int, int]  # crewId, slotIndex, roleId


class VariableBuilder:
    """Creates boolean decision variables for every valid (crew, slot, role)."""

    def __init__(self, model: cp_model.CpModel, time_grid: TimeGrid):
        self.model = model
        self.time_grid = time_grid

    def build(
        self,
        *,
        crew_records: List[dict],
        role_records: List[dict],
    ) -> Dict[AssignmentKey, cp_model.IntVar]:
        role_by_id = {role['id']: role for role in role_records}
        variables: Dict[AssignmentKey, cp_model.IntVar] = {}

        for crew in crew_records:
            crew_id = crew['id']
            eligible_role_ids = set(crew.get('roleIds') or [])
            if not eligible_role_ids:
                continue

            shift_start_min = crew['shiftStartMin']
            shift_end_min = crew['shiftEndMin']
            shift_start_slot = self.time_grid.minutes_to_slot_floor(shift_start_min)
            shift_end_slot = self.time_grid.minutes_to_slot_floor(shift_end_min)
            if shift_end_slot <= shift_start_slot:
                continue

            for role_id in eligible_role_ids:
                role = role_by_id.get(role_id)
                if not role:
                    continue

                allowed_slots = self._role_slot_window(
                    role,
                    shift_start_slot=shift_start_slot,
                    shift_end_slot=shift_end_slot,
                    shift_start_min=shift_start_min,
                )
                if not allowed_slots:
                    continue

                for slot in allowed_slots:
                    if not self._slot_is_valid(slot, role):
                        continue

                    key: AssignmentKey = (crew_id, slot, role_id)
                    variables[key] = self.model.NewBoolVar(
                        f"x_{crew_id}_{slot}_{role['code']}"
                    )

        return variables

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _role_slot_window(
        self,
        role: dict,
        shift_start_slot: int,
        shift_end_slot: int,
        *,
        shift_start_min: int,
    ) -> list[int]:
        """Return the candidate range of slots for the role within the shift."""
        start = shift_start_slot
        end = shift_end_slot

        offsets = role.get('windowOffsets')
        if offsets:
            start_offset = offsets.get('startOffsetMin')
            end_offset = offsets.get('endOffsetMin')
            if start_offset is not None:
                start_minutes = shift_start_min + start_offset
                start = max(start, self.time_grid.minutes_to_slot_floor(start_minutes))
            if end_offset is not None:
                end_minutes = shift_start_min + end_offset
                end = min(end, self.time_grid.minutes_to_slot_floor(end_minutes))

        if end <= start:
            return []
        return list(range(start, end))

    def _slot_is_valid(self, slot: int, role: dict) -> bool:
        start_minute, _ = self.time_grid.slot_to_minutes(slot)
        if not role.get('allowOutsideStoreHours', False):
            if start_minute < self.time_grid.open_minutes:
                return False
            if start_minute >= self.time_grid.close_minutes:
                return False
        return True


__all__ = ["VariableBuilder", "AssignmentKey"]
