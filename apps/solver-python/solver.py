#!/usr/bin/env python3
"""
Logbook MILP Solver using OR-Tools CP-SAT

This module takes a JSON input describing crew, constraints, and preferences,
and returns an optimal daily task assignment using Mixed-Integer Linear Programming.

Time resolution: 30-minute slots.
slot 0   = 00:00–00:30
slot 1   = 00:30–01:00
...
slot 47  = 23:30–24:00
"""

import json
import sys
from typing import Dict, List, Any, Tuple
from ortools.sat.python import cp_model


class LogbookSolver:
    """MILP solver for daily logbook scheduling (30-minute slots)"""

    def __init__(self, data: Dict[str, Any]):
        self.model = cp_model.CpModel()

        # Core input
        self.date = data['date']
        self.store = data['store']
        self.crew = data['crew']
        self.hourly_requirements = data.get('hourlyRequirements', [])
        self.crew_role_requirements = data.get('crewRoleRequirements', [])
        self.coverage_windows = data.get('coverageWindows', [])
        self.role_metadata = data.get('roleMetadata', [])
        self.time_limit = data.get('timeLimitSeconds', 300)

        # Time resolution: 30-minute slots
        self.slot_minutes = 30
        self.num_slots = (24 * 60) // self.slot_minutes  # 48
        self.slots = range(self.num_slots)
        self.hours = range(24)  # still useful for hour-based inputs

        # Role metadata lookup, keyed by role code string
        # Expected optional fields per meta:
        #   - role: str
        #   - isUniversal: bool
        #   - isConsecutive: bool
        #   - isBreakRole: bool
        #   - isParkingRole: bool
        self.role_meta_map: Dict[str, Dict[str, Any]] = {
            meta['role']: meta for meta in self.role_metadata if 'role' in meta
        }

        # Fallback defaults if metadata is missing
        self._default_universal_roles = {'REGISTER', 'PRODUCT', 'PARKING_HELM', 'MEAL_BREAK'}

        # Crew IDs
        self.crew_ids = [c['id'] for c in self.crew]

        # Role set from crew assignments
        self.roles = set()
        for c in self.crew:
            for role in self._crew_roles(c):
                self.roles.add(role)

        # Ensure default universal roles are in the role set
        self.roles.update(self._default_universal_roles)

        # Half-hour-capable roles (only these are allowed to split inside an hour)
        # Roles NOT in this set are effectively hour-long (must be same in both slots of an hour).
        self.half_hour_roles = {'PRODUCT', 'PARKING_HELM', 'MEAL_BREAK'}

        # Decision variables: x[(crew_id, slot, role)] = 1 if crew does role in that 30min slot
        self.x: Dict[Tuple[Any, int, str], cp_model.IntVar] = {}

        # Build full model
        self.build_decision_variables()
        self.add_hard_constraints()
        self.add_objective()

    # -------------------------------------------------------------------------
    # Role metadata helpers
    # -------------------------------------------------------------------------

    def _is_universal_role(self, role: str) -> bool:
        meta = self.role_meta_map.get(role)
        if meta is not None and 'isUniversal' in meta:
            return bool(meta.get('isUniversal'))
        return role in self._default_universal_roles

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

    def _break_roles(self) -> List[str]:
        roles = [r for r, meta in self.role_meta_map.items() if meta.get('isBreakRole', False)]
        return roles or ['MEAL_BREAK']

    def _parking_roles(self) -> List[str]:
        roles = [r for r, meta in self.role_meta_map.items() if meta.get('isParkingRole', False)]
        return roles or ['PARKING_HELM']

    def _crew_roles(self, crew: Dict[str, Any]) -> List[str]:
        """Return list of roles a crew member can perform."""
        eligible = crew.get('eligibleRoles')
        if eligible:
            return list(eligible)
        legacy_roles = crew.get('roles', []) or []
        return [r['role'] for r in legacy_roles if isinstance(r, dict) and 'role' in r]

    # -------------------------------------------------------------------------
    # Variables
    # -------------------------------------------------------------------------

    def build_decision_variables(self):
        """Create decision variables x[c,s,r] for each crew, slot, role combination."""
        for crew_id in self.crew_ids:
            crew = next(c for c in self.crew if c['id'] == crew_id)
            assigned_roles = self._crew_roles(crew)

            # Shift bounds in slots
            shift_start_slot = crew.get('shiftStartMin', 0) // self.slot_minutes
            shift_end_slot = crew.get('shiftEndMin', 24 * 60) // self.slot_minutes

            for slot in self.slots:
                if slot < shift_start_slot or slot >= shift_end_slot:
                    continue

                for role in self.roles:
                    if self._is_universal_role(role) or role in assigned_roles:
                        var_name = f'x_{crew_id}_{slot}_{role}'
                        self.x[(crew_id, slot, role)] = self.model.NewBoolVar(var_name)

    # -------------------------------------------------------------------------
    # Hard constraints
    # -------------------------------------------------------------------------

    def add_hard_constraints(self):
        """Add all hard constraints to the model."""

        # ------------------------------------------------------------------
        # Constraint 1: One task per person per 30-min slot (NO IDLE TIME)
        # ------------------------------------------------------------------
        for crew_id in self.crew_ids:
            crew = next(c for c in self.crew if c['id'] == crew_id)
            shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // self.slot_minutes

            for slot in range(shift_start_slot, shift_end_slot):
                role_vars = [
                    self.x[(crew_id, slot, role)]
                    for role in self.roles
                    if (crew_id, slot, role) in self.x
                ]
                if role_vars:
                    self.model.Add(sum(role_vars) == 1)

        # ------------------------------------------------------------------
        # Constraint 2: Hourly staffing requirements (REGISTER/PRODUCT/PARKING_HELM)
        # We treat each hour's requirement as applying to BOTH 30-min slots of that hour.
        # Fail fast if impossible.
        # ------------------------------------------------------------------
        for req in self.hourly_requirements:
            hour = req['hour']
            slot1 = hour * 2
            slot2 = hour * 2 + 1
            hour_slots = [slot1, slot2]

            # REGISTER
            if req.get('requiredRegister', 0) > 0:
                for slot in hour_slots:
                    reg_vars = [
                        self.x[(c, slot, 'REGISTER')]
                        for c in self.crew_ids
                        if (c, slot, 'REGISTER') in self.x
                    ]
                    if not reg_vars:
                        raise ValueError(
                            f"Hour {hour}, slot {slot}: requiredRegister="
                            f"{req['requiredRegister']} but no crew can be assigned to REGISTER."
                        )
                    self.model.Add(sum(reg_vars) == req['requiredRegister'])

            # PRODUCT
            if req.get('requiredProduct', 0) > 0:
                for slot in hour_slots:
                    prod_vars = [
                        self.x[(c, slot, 'PRODUCT')]
                        for c in self.crew_ids
                        if (c, slot, 'PRODUCT') in self.x
                    ]
                    if not prod_vars:
                        raise ValueError(
                            f"Hour {hour}, slot {slot}: requiredProduct="
                            f"{req['requiredProduct']} but no crew can be assigned to PRODUCT."
                        )
                    self.model.Add(sum(prod_vars) == req['requiredProduct'])

            # PARKING_HELM
            if req.get('requiredParkingHelm', 0) > 0:
                for slot in hour_slots:
                    parking_vars = [
                        self.x[(c, slot, 'PARKING_HELM')]
                        for c in self.crew_ids
                        if (c, slot, 'PARKING_HELM') in self.x
                    ]
                    if not parking_vars:
                        raise ValueError(
                            f"Hour {hour}, slot {slot}: requiredParkingHelm="
                            f"{req['requiredParkingHelm']} but no crew can be assigned to PARKING_HELM."
                        )
                    self.model.Add(sum(parking_vars) == req['requiredParkingHelm'])

        # ------------------------------------------------------------------
        # Constraint 3: Parking roles never in FIRST HOUR of shift
        # → Forbid parking roles in the first two 30-min slots of the crew's shift
        # ------------------------------------------------------------------
        parking_roles = self._parking_roles()
        for crew_id in self.crew_ids:
            crew = next(c for c in self.crew if c['id'] == crew_id)
            shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // self.slot_minutes

            for slot in (shift_start_slot, shift_start_slot + 1):
                if slot >= shift_end_slot:
                    continue
                for role in parking_roles:
                    key = (crew_id, slot, role)
                    if key in self.x:
                        self.model.Add(self.x[key] == 0)

        # ------------------------------------------------------------------
        # Constraint 4: Per-crew required role hours (exact, fail fast)
        #
        # requiredHours is in HOURS; with 30-min slots we need 2 slots per hour.
        # So: sum_slots x[c,slot,role] == requiredHours * 2
        # ------------------------------------------------------------------
        slots_per_hour = 60 // self.slot_minutes  # = 2
        for req in self.crew_role_requirements:
            crew_id = req['crewId']
            role = req['role']
            required_hours = req['requiredHours']
            required_slots = required_hours * slots_per_hour

            role_slots = [
                self.x[(crew_id, s, role)]
                for s in self.slots
                if (crew_id, s, role) in self.x
            ]

            if required_slots > 0 and not role_slots:
                crew = next((c for c in self.crew if c['id'] == crew_id), None)
                crew_name = crew['name'] if crew and 'name' in crew else crew_id
                raise ValueError(
                    f"Crew {crew_name} (id={crew_id}): requiredHours={required_hours} "
                    f"({required_slots} slots) on role {role} but has no available slots "
                    f"for that role in their shift."
                )

            if required_slots > 0:
                self.model.Add(sum(role_slots) == required_slots)

        # ------------------------------------------------------------------
        # Constraint 5: Coverage windows (DEMO/WINE_DEMO/etc.)
        # For each hour in the window, we enforce coverage in BOTH slots.
        # ------------------------------------------------------------------
        for window in self.coverage_windows:
            role = window['role']
            start_hour = window['startHour']
            end_hour = window['endHour']
            required_per_hour = window['requiredPerHour']

            for hour in range(start_hour, end_hour):
                for slot in (hour * 2, hour * 2 + 1):
                    hour_coverage = [
                        self.x[(c, slot, role)]
                        for c in self.crew_ids
                        if (c, slot, role) in self.x
                    ]
                    if required_per_hour > 0 and not hour_coverage:
                        raise ValueError(
                            f"Coverage window for {role}: hour {hour}, slot {slot} "
                            f"requires {required_per_hour} crew but no crew can be assigned."
                        )
                    self.model.Add(sum(hour_coverage) == required_per_hour)

        # ------------------------------------------------------------------
        # Constraint 6: MEAL_BREAK – real 30-minute break
        #  - Shifts >= 6h (12 slots): exactly ONE MEAL_BREAK slot in 3.0–4.5h window
        #  - Shifts < 6h or canBreak=False: no break allowed
        # ------------------------------------------------------------------
        break_roles = [r for r in self._break_roles() if r in self.roles]
        if break_roles:
            break_role = break_roles[0]

            for crew_id in self.crew_ids:
                crew = next(c for c in self.crew if c['id'] == crew_id)
                shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
                shift_end_slot = crew['shiftEndMin'] // self.slot_minutes
                shift_length_slots = shift_end_slot - shift_start_slot

                # If they cannot break at all, forbid break role everywhere
                if not crew.get('canBreak', True):
                    for slot in range(shift_start_slot, shift_end_slot):
                        key = (crew_id, slot, break_role)
                        if key in self.x:
                            self.model.Add(self.x[key] == 0)
                    continue

                # Shifts < 6h (12 slots) → no break required/allowed
                if shift_length_slots < 12:
                    for slot in range(shift_start_slot, shift_end_slot):
                        key = (crew_id, slot, break_role)
                        if key in self.x:
                            self.model.Add(self.x[key] == 0)
                    continue

                # Break window: 3.0–4.5 hours into shift
                # 3.0h  → +6 slots
                # 4.5h  → +9 slots
                earliest_break_slot = shift_start_slot + 6
                latest_break_slot = shift_start_slot + 9
                if latest_break_slot >= shift_end_slot:
                    latest_break_slot = shift_end_slot - 1

                break_vars = [
                    self.x[(crew_id, slot, break_role)]
                    for slot in range(earliest_break_slot, latest_break_slot + 1)
                    if (crew_id, slot, break_role) in self.x
                ]

                if not break_vars:
                    crew_name = crew.get('name', crew_id)
                    raise ValueError(
                        f"Crew {crew_name} (id={crew_id}): shift requires a meal break, "
                        f"but no {break_role} assignment is possible in slots "
                        f"{earliest_break_slot}-{latest_break_slot}."
                    )

                # Exactly 1 30-min break slot in that window
                self.model.Add(sum(break_vars) == 1)

                # Forbid break outside that window
                for slot in range(shift_start_slot, shift_end_slot):
                    if slot < earliest_break_slot or slot > latest_break_slot:
                        key = (crew_id, slot, break_role)
                        if key in self.x:
                            self.model.Add(self.x[key] == 0)

        # ------------------------------------------------------------------
        # Constraint 7: Hour-long roles must not change within the same hour
        #
        # Roles NOT in half_hour_roles are effectively hour-long.
        # For each crew and each hour (two slots), enforce:
        #   x[c,slot1,role] == x[c,slot2,role]
        # so they can't appear in only one 30-min slot.
        # ------------------------------------------------------------------
        for crew_id in self.crew_ids:
            crew = next(c for c in self.crew if c['id'] == crew_id)
            shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // self.slot_minutes

            # Hour index in slots
            first_hour_index = shift_start_slot // 2
            last_hour_index = (shift_end_slot - 1) // 2

            for hour in range(first_hour_index, last_hour_index + 1):
                slot1 = hour * 2
                slot2 = slot1 + 1
                if slot1 < shift_start_slot or slot2 >= shift_end_slot:
                    continue

                for role in self.roles:
                    if role in self.half_hour_roles:
                        continue
                    key1 = (crew_id, slot1, role)
                    key2 = (crew_id, slot2, role)
                    if key1 in self.x and key2 in self.x:
                        self.model.Add(self.x[key1] == self.x[key2])

    # -------------------------------------------------------------------------
    # Objective
    # -------------------------------------------------------------------------

    def add_objective(self):
        """Add weighted preference objective to maximize."""
        objective_terms = []

        for crew_id in self.crew_ids:
            crew = next(c for c in self.crew if c['id'] == crew_id)
            shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
            shift_end_slot = crew['shiftEndMin'] // self.slot_minutes

            # ===== 1. First-slot (first "hour") preference =====
            # We treat the very first 30-min slot as the "first hour" for this preference.
            pref_first_role = crew.get('prefFirstHour')
            weight_first_hour = crew.get('prefFirstHourWeight', 0)
            if pref_first_role and weight_first_hour > 0:
                key = (crew_id, shift_start_slot, pref_first_role)
                if key in self.x:
                    objective_terms.append(weight_first_hour * self.x[key])

            # ===== 2. Product vs Register bias (slot-based) =====
            pref_task = crew.get('prefTask')  # 'PRODUCT' or 'REGISTER'
            weight_task = crew.get('prefTaskWeight', 0)
            if pref_task and weight_task > 0:
                pref_task_slots = [
                    self.x[(crew_id, s, pref_task)]
                    for s in range(shift_start_slot, shift_end_slot)
                    if (crew_id, s, pref_task) in self.x
                ]
                if pref_task_slots:
                    objective_terms.append(weight_task * sum(pref_task_slots))

            # ===== 3. PRODUCT block-size (switch penalty across slots) =====
            weight_prod_block = crew.get('consecutiveProdWeight', 0)
            if weight_prod_block > 0 and 'PRODUCT' in self.roles:
                for s in range(shift_start_slot, shift_end_slot - 1):
                    key_s = (crew_id, s, 'PRODUCT')
                    key_s1 = (crew_id, s + 1, 'PRODUCT')
                    if key_s in self.x and key_s1 in self.x:
                        switch_var = self.model.NewBoolVar(f'switch_prod_{crew_id}_{s}')
                        x_s = self.x[key_s]
                        x_s1 = self.x[key_s1]
                        self.model.Add(switch_var >= x_s - x_s1)
                        self.model.Add(switch_var >= x_s1 - x_s)
                        objective_terms.append(-weight_prod_block * switch_var)

            # ===== 4. REGISTER block-size (switch penalty across slots) =====
            weight_reg_block = crew.get('consecutiveRegWeight', 0)
            if weight_reg_block > 0 and 'REGISTER' in self.roles:
                for s in range(shift_start_slot, shift_end_slot - 1):
                    key_s = (crew_id, s, 'REGISTER')
                    key_s1 = (crew_id, s + 1, 'REGISTER')
                    if key_s in self.x and key_s1 in self.x:
                        switch_var = self.model.NewBoolVar(f'switch_reg_{crew_id}_{s}')
                        x_s = self.x[key_s]
                        x_s1 = self.x[key_s1]
                        self.model.Add(switch_var >= x_s - x_s1)
                        self.model.Add(switch_var >= x_s1 - x_s)
                        objective_terms.append(-weight_reg_block * switch_var)

            # ===== 5. Break timing preference (earlier vs later within window) =====
            break_roles = [r for r in self._break_roles() if r in self.roles]
            if break_roles:
                break_role = break_roles[0]
                pref_break_timing = crew.get('prefBreakTiming', 0)  # -1 earlier, +1 later
                weight_break_timing = crew.get('prefBreakTimingWeight', 0)

                if weight_break_timing > 0 and pref_break_timing != 0:
                    earliest_break_slot = shift_start_slot + 6  # 3h
                    latest_break_slot = min(shift_start_slot + 9, shift_end_slot - 1)  # up to 4.5h
                    max_offset = latest_break_slot - earliest_break_slot
                    if max_offset > 0:
                        for slot in range(earliest_break_slot, latest_break_slot + 1):
                            key = (crew_id, slot, break_role)
                            if key in self.x:
                                offset = slot - earliest_break_slot
                                if pref_break_timing > 0:
                                    score = (offset / max_offset) * weight_break_timing
                                else:
                                    score = ((max_offset - offset) / max_offset) * weight_break_timing
                                objective_terms.append(score * self.x[key])

            # ===== 6. Parking distance-from-first preference (later is better) =====
            parking_roles = [r for r in self._parking_roles() if r in self.roles]
            if parking_roles and crew.get('canParkingHelms', True):
                for role in parking_roles:
                    for s in range(shift_start_slot + 2, shift_end_slot):
                        # start from slot+2 because slot 0/1 are forbidden already
                        key = (crew_id, s, role)
                        if key in self.x:
                            distance = s - shift_start_slot
                            max_distance = shift_end_slot - shift_start_slot - 1
                            if max_distance > 0:
                                penalty_weight = 50
                                normalized_distance = distance / max_distance
                                score = normalized_distance * penalty_weight
                                objective_terms.append(score * self.x[key])

        # ===== 7. Consecutive roles penalty (isConsecutive=true in metadata) =====
        consecutive_roles = [
            role for role, meta in self.role_meta_map.items()
            if meta.get('isConsecutive', False)
        ]
        for role in consecutive_roles:
            if role not in self.roles:
                continue
            for crew_id in self.crew_ids:
                crew = next(c for c in self.crew if c['id'] == crew_id)
                shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
                shift_end_slot = crew['shiftEndMin'] // self.slot_minutes
                for s in range(shift_start_slot, shift_end_slot - 1):
                    key_s = (crew_id, s, role)
                    key_s1 = (crew_id, s + 1, role)
                    if key_s in self.x and key_s1 in self.x:
                        gap_var = self.model.NewBoolVar(f'{role}_gap_{crew_id}_{s}')
                        x_s = self.x[key_s]
                        x_s1 = self.x[key_s1]
                        self.model.Add(gap_var >= x_s - x_s1)
                        self.model.Add(gap_var >= x_s1 - x_s)
                        objective_terms.append(-500 * gap_var)

        # Final objective
        if objective_terms:
            self.model.Maximize(sum(objective_terms))
        else:
            # Fallback: maximize total assignments
            total_assignments = sum(self.x.values())
            self.model.Maximize(total_assignments)

    # -------------------------------------------------------------------------
    # Solve + result
    # -------------------------------------------------------------------------

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
                        'startTime': slot * self.slot_minutes,           # minutes from midnight
                        'endTime': (slot + 1) * self.slot_minutes
                    })
            result['assignments'] = assignments
            result['metadata']['numAssignments'] = len(assignments)

        elif status == cp_model.INFEASIBLE:
            result['metadata']['violations'] = self._detect_violations()

        return result

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _status_to_string(self, status: int) -> str:
        status_map = {
            cp_model.OPTIMAL: 'OPTIMAL',
            cp_model.FEASIBLE: 'FEASIBLE',
            cp_model.INFEASIBLE: 'INFEASIBLE',
            cp_model.MODEL_INVALID: 'ERROR',
            cp_model.UNKNOWN: 'TIME_LIMIT'
        }
        return status_map.get(status, 'ERROR')

    def _detect_violations(self) -> List[str]:
        """Heuristic detection for likely violations when model is INFEASIBLE."""
        violations: List[str] = []

        # Check 1: Hourly staffing availability vs required staffing (min over two slots)
        for req in self.hourly_requirements:
            hour = req['hour']
            slot1 = hour * 2
            slot2 = hour * 2 + 1

            # REGISTER
            if req.get('requiredRegister', 0) > 0:
                avail1 = sum(1 for c in self.crew_ids if (c, slot1, 'REGISTER') in self.x)
                avail2 = sum(1 for c in self.crew_ids if (c, slot2, 'REGISTER') in self.x)
                available_register = min(avail1, avail2)
                if available_register < req['requiredRegister']:
                    violations.append(
                        f"Hour {hour}: Need {req['requiredRegister']} REGISTER crew "
                        f"but only {available_register} available in at least one 30-min slot."
                    )

            # PRODUCT
            if req.get('requiredProduct', 0) > 0:
                avail1 = sum(1 for c in self.crew_ids if (c, slot1, 'PRODUCT') in self.x)
                avail2 = sum(1 for c in self.crew_ids if (c, slot2, 'PRODUCT') in self.x)
                available_product = min(avail1, avail2)
                if available_product < req['requiredProduct']:
                    violations.append(
                        f"Hour {hour}: Need {req['requiredProduct']} PRODUCT crew "
                        f"but only {available_product} available in at least one 30-min slot."
                    )

            # PARKING_HELM
            if req.get('requiredParkingHelm', 0) > 0:
                avail1 = sum(1 for c in self.crew_ids if (c, slot1, 'PARKING_HELM') in self.x)
                avail2 = sum(1 for c in self.crew_ids if (c, slot2, 'PARKING_HELM') in self.x)
                available_parking = min(avail1, avail2)
                if available_parking < req['requiredParkingHelm']:
                    violations.append(
                        f"Hour {hour}: Need {req['requiredParkingHelm']} PARKING_HELM crew "
                        f"but only {available_parking} available in at least one 30-min slot."
                    )

        # Check 2: Crew role hours availability vs required hours
        slots_per_hour = 60 // self.slot_minutes  # 2
        for req in self.crew_role_requirements:
            crew_id = req['crewId']
            role = req['role']
            required_hours = req['requiredHours']
            required_slots = required_hours * slots_per_hour

            available_slots = sum(
                1 for s in self.slots
                if (crew_id, s, role) in self.x
            )

            if available_slots < required_slots:
                crew = next((c for c in self.crew if c['id'] == crew_id), None)
                crew_name = crew['name'] if crew else crew_id
                violations.append(
                    f"Crew {crew_name}: Need {required_hours} hours ({required_slots} slots) "
                    f"on {role} but only {available_slots} slots available in shift."
                )

        # Check 3: Coverage windows availability
        for window in self.coverage_windows:
            role = window['role']
            start_hour = window['startHour']
            end_hour = window['endHour']
            required_per_hour = window['requiredPerHour']

            for hour in range(start_hour, end_hour):
                for slot in (hour * 2, hour * 2 + 1):
                    available_crew = sum(
                        1 for c in self.crew_ids
                        if (c, slot, role) in self.x
                    )
                    if available_crew < required_per_hour:
                        violations.append(
                            f"{role} coverage window: Hour {hour} (slot {slot}) needs "
                            f"{required_per_hour} crew but only {available_crew} available."
                        )

        # Check 4: Meal break feasibility window
        break_roles = [r for r in self._break_roles() if r in self.roles]
        if break_roles:
            break_role = break_roles[0]
            for crew_id in self.crew_ids:
                crew = next(c for c in self.crew if c['id'] == crew_id)
                if not crew.get('canBreak', True):
                    continue

                shift_start_slot = crew['shiftStartMin'] // self.slot_minutes
                shift_end_slot = crew['shiftEndMin'] // self.slot_minutes
                shift_length_slots = shift_end_slot - shift_start_slot

                if shift_length_slots >= 12:
                    earliest_break_slot = shift_start_slot + 6
                    latest_break_slot = min(shift_start_slot + 9, shift_end_slot - 1)
                    has_break_vars = any(
                        (crew_id, s, break_role) in self.x
                        for s in range(earliest_break_slot, latest_break_slot + 1)
                    )
                    if not has_break_vars:
                        crew_name = crew.get('name', crew_id)
                        violations.append(
                            f"Crew {crew_name}: Cannot schedule required meal break in "
                            f"valid slots {earliest_break_slot}-{latest_break_slot}."
                        )

        return violations or ["Model is infeasible but specific violations could not be determined"]


def main():
    """Main entry point - reads JSON from stdin, outputs JSON to stdout."""
    try:
        input_data = json.load(sys.stdin)
        solver = LogbookSolver(input_data)
        result = solver.solve()
        print(json.dumps(result, indent=2))
    except Exception as e:
        error_result = {
            'success': False,
            'metadata': {
                'status': 'ERROR',
                'runtimeMs': 0,
                'numCrew': 0,
                'numSlots': 0,
                'numAssignments': 0,
                'violations': [str(e)]
            },
            'error': str(e)
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()