"""Core LogbookSolver class and shared helpers."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from ortools.sat.python import cp_model

from . import constraints, objective, diagnostics


class LogbookSolver:
    """MILP solver for daily logbook scheduling with store-driven slots."""

    def __init__(self, data: Dict[str, Any]):
        self.model = cp_model.CpModel()

        # ------------------------------------------------------------------
        # Raw inputs
        # ------------------------------------------------------------------
        self.date = data['date']
        self.store = data.get('store', {})
        self.crew = data['crew']
        self.hourly_requirements = data.get('hourlyRequirements', [])
        self.crew_role_requirements = data.get('crewRoleRequirements', [])
        self.coverage_windows = data.get('coverageWindows', [])
        self.role_metadata = data.get('roleMetadata', [])
        self.time_limit = data.get('timeLimitSeconds', 300)

        # ------------------------------------------------------------------
        # Time resolution + store policies
        # ------------------------------------------------------------------
        self.slot_minutes = self._sanitize_slot_minutes(self.store.get('baseSlotMinutes', 30))
        self.num_slots = (24 * 60) // self.slot_minutes
        self.slots_per_hour = 60 // self.slot_minutes
        self.slots = range(self.num_slots)
        self.hours = range(24)
        self.open_minutes = self.store.get('openMinutesFromMidnight', 0)
        self.close_minutes = self.store.get('closeMinutesFromMidnight', 24 * 60)
        reg_start = self.store.get('startRegHour', self.open_minutes)
        reg_end = self.store.get('endRegHour', self.close_minutes)
        reg_start = min(max(self.open_minutes, reg_start), self.close_minutes)
        reg_end = min(max(self.open_minutes, reg_end), self.close_minutes)
        if reg_end <= reg_start:
            reg_end = min(self.close_minutes, reg_start + self.slot_minutes)
        self.register_window = (reg_start, reg_end)

        # ------------------------------------------------------------------
        # Derived indices & metadata
        # ------------------------------------------------------------------
        self._default_universal_roles = {'REGISTER', 'PRODUCT', 'PARKING_HELM', 'MEAL_BREAK'}
        self.role_meta_map: Dict[str, Dict[str, Any]] = {
            meta['role']: meta for meta in self.role_metadata if 'role' in meta
        }

        self._index_crew()
        self._index_roles()

        # Decision variables: x[(crew_id, slot, role)] = 1 if crew does role in that slot
        self.x: Dict[Tuple[Any, int, str], cp_model.IntVar] = {}
        self._build_decision_variables()

        # Attach constraints & objective via helper modules
        constraints.add_all_constraints(self)
        objective.add_objective(self)

    # ------------------------------------------------------------------
    # Indexing helpers
    # ------------------------------------------------------------------
    def _index_crew(self) -> None:
        self.crew_ids = [c['id'] for c in self.crew]
        self.crew_by_id = {c['id']: c for c in self.crew}

    def _index_roles(self) -> None:
        self.roles = set()
        for crew in self.crew:
            for role in self._crew_roles(crew):
                self.roles.add(role)
        self.roles.update(self._default_universal_roles)

        self.half_hour_roles = set()
        for role in self.roles:
            slot_mode = self._get_slot_size_mode(role)
            if slot_mode in ('HALF_HOUR_ONLY', 'HALF_OR_FULL'):
                self.half_hour_roles.add(role)

    # ------------------------------------------------------------------
    # Decision variables
    # ------------------------------------------------------------------
    def _build_decision_variables(self) -> None:
        for crew_id in self.crew_ids:
            crew = self.crew_by_id[crew_id]
            assigned_roles = self._crew_roles(crew)

            shift_start_slot = self._minutes_to_slot_floor(crew.get('shiftStartMin', 0))
            shift_end_slot = min(
                self._minutes_to_slot_ceil(crew.get('shiftEndMin', 24 * 60)),
                self.num_slots,
            )

            for slot in range(shift_start_slot, shift_end_slot):
                inside_store_hours = self._slot_inside_store_hours(slot)
                for role in self.roles:
                    if not (self._is_universal_role(role) or role in assigned_roles):
                        continue

                    if not inside_store_hours and not self._role_allows_outside_hours(role):
                        continue

                    if self._is_register_role(role) and not self._slot_inside_register_window(slot):
                        continue

                    var_name = f'x_{crew_id}_{slot}_{role}'
                    self.x[(crew_id, slot, role)] = self.model.NewBoolVar(var_name)

    # ------------------------------------------------------------------
    # Solve & results
    # ------------------------------------------------------------------
    def solve(self) -> Dict[str, Any]:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.time_limit

        status = solver.Solve(self.model)
        result = {
            'success': status in (cp_model.OPTIMAL, cp_model.FEASIBLE),
            'metadata': {
                'status': self._status_to_string(status),
                'objectiveScore': int(solver.ObjectiveValue()) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
                'runtimeMs': int(solver.WallTime() * 1000),
                'mipGap': 0.0 if status == cp_model.OPTIMAL else None,
                'numCrew': len(self.crew_ids),
                'numSlots': self.num_slots,
                'slotMinutes': self.slot_minutes,
                'numAssignments': 0,
                'violations': []
            },
            'assignments': []
        }

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            assignments = []
            for (crew_id, slot, role), var in self.x.items():
                if solver.Value(var) == 1:
                    assignments.append({
                        'crewId': crew_id,
                        'taskType': role,
                        'startTime': slot * self.slot_minutes,
                        'endTime': (slot + 1) * self.slot_minutes
                    })
            result['assignments'] = assignments
            result['metadata']['numAssignments'] = len(assignments)

        elif status == cp_model.INFEASIBLE:
            result['metadata']['violations'] = diagnostics.detect_violations(self)

        return result

    # ------------------------------------------------------------------
    # Helper methods used across modules
    # ------------------------------------------------------------------
    def _crew_roles(self, crew: Dict[str, Any]) -> List[str]:
        eligible = crew.get('eligibleRoles')
        if eligible:
            return list(eligible)
        legacy_roles = crew.get('roles', []) or []
        return [r['role'] for r in legacy_roles if isinstance(r, dict) and 'role' in r]

    def _is_universal_role(self, role: str) -> bool:
        meta = self.role_meta_map.get(role)
        if meta is not None and 'isUniversal' in meta:
            return bool(meta.get('isUniversal'))
        return role in self._default_universal_roles

    def _get_slot_size_mode(self, role: str) -> str:
        meta = self.role_meta_map.get(role)
        if meta is not None and 'slotSizeMode' in meta:
            return meta.get('slotSizeMode')
        return 'HOUR_ONLY' if role == 'REGISTER' else 'HALF_OR_FULL'

    def _break_roles(self) -> List[str]:
        roles = [r for r, meta in self.role_meta_map.items() if meta.get('isBreakRole', False)]
        return roles or ['MEAL_BREAK']

    def _parking_roles(self) -> List[str]:
        roles = [r for r, meta in self.role_meta_map.items() if meta.get('isParkingRole', False)]
        return roles or ['PARKING_HELM']

    def _is_break_role(self, role: str) -> bool:
        meta = self.role_meta_map.get(role)
        if meta is not None and 'isBreakRole' in meta:
            return bool(meta.get('isBreakRole'))
        return role == 'MEAL_BREAK'

    def _is_parking_role(self, role: str) -> bool:
        meta = self.role_meta_map.get(role)
        if meta is not None and 'isParkingRole' in meta:
            return bool(meta.get('isParkingRole'))
        return role == 'PARKING_HELM'

    def _is_register_role(self, role: str) -> bool:
        return role == 'REGISTER'

    def _role_allows_outside_hours(self, role: str) -> bool:
        meta = self.role_meta_map.get(role, {})
        return bool(meta.get('allowOutsideStoreHours', False))

    def _slot_start_minute(self, slot: int) -> int:
        return slot * self.slot_minutes

    def _slot_inside_store_hours(self, slot: int) -> bool:
        slot_start = self._slot_start_minute(slot)
        return self.open_minutes <= slot_start < self.close_minutes

    def _slot_inside_register_window(self, slot: int) -> bool:
        slot_start = self._slot_start_minute(slot)
        start_reg, end_reg = self.register_window
        return start_reg <= slot_start < end_reg

    def _minutes_to_slot_floor(self, minutes: int) -> int:
        return max(0, minutes // self.slot_minutes)

    def _minutes_to_slot_ceil(self, minutes: int) -> int:
        return max(0, math.ceil(minutes / self.slot_minutes))

    def _hour_slots(self, hour: int) -> range:
        start = hour * self.slots_per_hour
        end = min(start + self.slots_per_hour, self.num_slots)
        return range(start, end)

    def _store_break_policy(self) -> Dict[str, int]:
        return {
            'min_shift_minutes': self.store.get('minShiftMinutesForBreak', 360),
            'break_start_offset_minutes': self.store.get('breakWindowStartOffsetMinutes', 180),
            'break_end_offset_minutes': self.store.get('breakWindowEndOffsetMinutes', 270),
        }

    def _min_shift_slots_for_break(self) -> int:
        policy = self._store_break_policy()
        return max(1, math.ceil(policy['min_shift_minutes'] / self.slot_minutes))

    def _break_window_for_shift(self, shift_start_slot: int, shift_end_slot: int) -> Tuple[int, int]:
        policy = self._store_break_policy()
        start_offset_slots = max(0, policy['break_start_offset_minutes'] // self.slot_minutes)
        end_offset_slots = max(start_offset_slots, policy['break_end_offset_minutes'] // self.slot_minutes)
        earliest = shift_start_slot + start_offset_slots
        latest = min(shift_start_slot + end_offset_slots, shift_end_slot - 1)
        return earliest, max(earliest, latest)

    def _slot_to_hour_index(self, slot: int) -> int:
        return slot // self.slots_per_hour

    def _sanitize_slot_minutes(self, slot_minutes: int) -> int:
        value = int(slot_minutes) if slot_minutes else 30
        if value <= 0:
            raise ValueError('Store baseSlotMinutes must be positive')
        if 60 % value != 0:
            raise ValueError('Store baseSlotMinutes must divide 60 for hourly requirements')
        return value

    def _status_to_string(self, status: int) -> str:
        status_map = {
            cp_model.OPTIMAL: 'OPTIMAL',
            cp_model.FEASIBLE: 'FEASIBLE',
            cp_model.INFEASIBLE: 'INFEASIBLE',
            cp_model.MODEL_INVALID: 'ERROR',
            cp_model.UNKNOWN: 'TIME_LIMIT'
        }
        return status_map.get(status, 'ERROR')


__all__ = ['LogbookSolver']
