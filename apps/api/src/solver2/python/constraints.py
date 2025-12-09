"""Constraint builders for the metadata-driven solver."""
from __future__ import annotations

from collections import defaultdict
import sys
from dataclasses import dataclass, field
from math import ceil
from typing import Any, DefaultDict, Dict, List, Optional

from ortools.sat.python import cp_model

from .time_grid import CrewShiftWindow, TimeGrid
from .variables import AssignmentVariable, VariableBundle


ConstraintDescriptor = Dict[str, Any]
ConstraintFamily = str
ObjectiveDescriptor = Dict[str, Any]
ObjectiveFamily = str


OBJECTIVE_SCALE = 1000


@dataclass
class ModelEnvelope:
    """Thin wrapper around ``cp_model.CpModel`` with parity metadata."""

    variable_bundle: VariableBundle
    constraints: DefaultDict[ConstraintFamily, List[ConstraintDescriptor]] = field(
        default_factory=lambda: defaultdict(list)
    )
    objective_terms: DefaultDict[ObjectiveFamily, List[ObjectiveDescriptor]] = field(
        default_factory=lambda: defaultdict(list)
    )
    objective_scale: int = OBJECTIVE_SCALE
    _objective_linear_terms: List[tuple[int, cp_model.IntVar]] = field(default_factory=list)
    uncovered_slots: List[Dict[str, Any]] = field(default_factory=list)
    infeasibility_warnings: List[str] = field(default_factory=list)
    role_min_stats: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    block_size_stats: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    # Lookups for friendly error messages
    role_lookup: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    crew_lookup: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    @property
    def cp_model(self) -> cp_model.CpModel:
        return self.variable_bundle.model
    def add_constraint(self, family: ConstraintFamily, descriptor: ConstraintDescriptor) -> None:
        self.constraints[family].append(descriptor)
        # Removed verbose debug logging
        if family == "guardrail":
            self._apply_guardrail(descriptor)
        elif family == "hourly":
            self._apply_hourly(descriptor)
        elif family == "window":
            self._apply_hourly(descriptor)
        elif family == "daily":
            self._apply_daily(descriptor)
        elif family == "role_min":
            self._apply_role_min(descriptor)
        elif family == "role_max":
            self._apply_role_max(descriptor)
        elif family == "consecutive_required":
            self._apply_consecutive_required(descriptor)
        elif family == "block_size":
            self._apply_block_size(descriptor)
        # ``consecutive_preferred`` is captured via objective penalties.

    def add_objective_term(self, family: ObjectiveFamily, descriptor: ObjectiveDescriptor) -> None:
        self.objective_terms[family].append(descriptor)
        if family in {"preferences", "fairness"}:
            self._apply_linear_objective(descriptor)
        elif family == "consecutive":
            self._apply_consecutive_objective(descriptor)

    def commit_objective(self) -> None:
        if not self._objective_linear_terms:
            self.cp_model.Maximize(0)
            return
        expression = sum(coefficient * var for coefficient, var in self._objective_linear_terms)
        self.cp_model.Maximize(expression)

    def summary(self) -> Dict[str, Any]:
        counts: Dict[str, Any] = {family: len(records) for family, records in self.constraints.items()}
        for family, records in self.objective_terms.items():
            counts[f"objective:{family}"] = len(records)
        counts["uncovered_slots"] = len(self.uncovered_slots)
        counts["infeasibility_warnings"] = self.infeasibility_warnings
        counts["role_min_stats"] = self.role_min_stats
        counts["block_size_stats"] = self.block_size_stats
        return counts

    # ------------------------------------------------------------------
    # Constraint helpers
    # ------------------------------------------------------------------
    def _apply_guardrail(self, descriptor: ConstraintDescriptor) -> None:
        vars_ = self._vars(descriptor.get("variables", []))
        if not vars_:
            return
        # Exactly one role per crew per slot - every slot must be filled
        self.cp_model.Add(sum(vars_) == 1)

    def _apply_hourly(self, descriptor: ConstraintDescriptor) -> None:
        """Apply hourly/window coverage constraint.
        
        requiredPerBlock (or requiredPerHour) specifies how many blocks must be assigned
        at this slot position. Each variable is one block assignment.
        """
        vars_ = self._vars(descriptor.get("variables", []))
        # Support both old "requiredPerHour" and new "requiredPerBlock" keys
        required = int(descriptor.get("requiredPerBlock", 0) or descriptor.get("requiredPerHour", 0) or descriptor.get("required", 0))
        
        # Debug output
        import sys
        role_id = descriptor.get('roleId')
        role = self.role_lookup.get(role_id, {})
        role_name = role.get("displayName", f"Role {role_id}")
        window_range = descriptor.get('windowRange')
        print(f"[HOURLY DEBUG] role={role_name}, required={required}, vars_count={len(vars_)}, window={window_range}", file=sys.stderr)
        
        if not vars_:
            # No vars means no crew available for this slot/role at all
            if window_range:
                start_h, end_h = window_range
                slot_index = descriptor.get('slotIndex', '?')
                self.infeasibility_warnings.append(
                    f"Cannot meet {role_name} coverage window ({start_h}:00-{end_h}:00) at slot {slot_index}: "
                    f"need {required} crew members but none are available."
                )
            else:
                hour = descriptor.get('hour', descriptor.get('slotIndex', '?'))
                self.infeasibility_warnings.append(
                    f"Cannot meet {role_name} coverage at hour {hour}: need {required} crew members but none are available."
                )
            return
            
        if len(vars_) < required:
            # Check if this is a window constraint (has windowRange) or hourly
            if window_range:
                start_h, end_h = window_range
                slot_index = descriptor.get('slotIndex', '?')
                self.infeasibility_warnings.append(
                    f"Cannot meet {role_name} coverage window ({start_h}:00-{end_h}:00) at slot {slot_index}: "
                    f"need {required} crew members but only {len(vars_)} are available."
                )
            else:
                hour = descriptor.get('hour', descriptor.get('slotIndex', '?'))
                self.infeasibility_warnings.append(
                    f"Cannot meet {role_name} coverage at hour {hour}: need {required} crew members but only {len(vars_)} are available."
                )
        self.cp_model.Add(sum(vars_) == required)

    def _apply_daily(self, descriptor: ConstraintDescriptor) -> None:
        """Apply daily requirement constraint.
        
        With mixed block sizes (e.g., blockSize=2 for hours, blockSize=1 for half-hours),
        we need to count total SLOTS covered, not number of blocks.
        
        Each variable contributes its slot_count to the total.
        Daily constraints enforce EXACT assignment (==), not just minimum.
        """
        assignment_vars = self._assignment_variables(descriptor.get("variables", []))
        if not assignment_vars:
            return
        required_slots = int(descriptor.get("requiredSlots", 0))
        
        # Filter to vars that have cp_var set
        valid_vars = [var for var in assignment_vars if var.cp_var is not None]
        if not valid_vars:
            return
        
        # Sum up slot_count * var for each variable (mixed block sizes)
        # This gives us total slots assigned
        terms = [var.slot_count * var.cp_var for var in valid_vars]
        total_slots_expr = sum(terms)
        
        # Check if we have enough capacity
        max_possible_slots = sum(var.slot_count for var in valid_vars)
        if max_possible_slots < required_slots:
            role_id = descriptor.get('roleId')
            crew_id = descriptor.get('crewId')
            role = self.role_lookup.get(role_id, {})
            crew = self.crew_lookup.get(str(crew_id), {})
            role_name = role.get("displayName", f"Role {role_id}")
            crew_name = crew.get("name", f"Crew {crew_id}")
            # Convert slots to hours for display (assuming 30-min base slot)
            required_hours = (required_slots * 30) / 60
            available_hours = (max_possible_slots * 30) / 60
            self.infeasibility_warnings.append(
                f"{crew_name}'s daily {role_name} constraint of {required_hours:.1f}h cannot be satisfied - only {available_hours:.1f}h of eligible time slots available."
            )
        
        self.cp_model.Add(total_slots_expr == required_slots)

    def _apply_role_min(self, descriptor: ConstraintDescriptor) -> None:
        """minSlots is the minimum number of SLOTS (not blocks) to assign.
        
        With mixed block sizes, we sum slot_count * var for each variable.
        """
        assignment_vars = self._assignment_variables(descriptor.get("variables", []))
        if not assignment_vars:
            return
        minimum = int(descriptor.get("minSlots", 0))
        if minimum <= 0:
            return
        
        valid_vars = [var for var in assignment_vars if var.cp_var is not None]
        if not valid_vars:
            return
        
        # Sum up slot_count * var for each variable (handles mixed block sizes)
        terms = [var.slot_count * var.cp_var for var in valid_vars]
        total_slots_expr = sum(terms)
        
        self.cp_model.Add(total_slots_expr >= minimum)

    def _apply_role_max(self, descriptor: ConstraintDescriptor) -> None:
        """maxSlots is the maximum number of SLOTS (not blocks) to assign.
        
        With mixed block sizes, we sum slot_count * var for each variable.
        """
        assignment_vars = self._assignment_variables(descriptor.get("variables", []))
        if not assignment_vars:
            return
        maximum = int(descriptor.get("maxSlots", 0))
        if maximum <= 0:
            return
        
        valid_vars = [var for var in assignment_vars if var.cp_var is not None]
        if not valid_vars:
            return
        
        # Sum up slot_count * var for each variable (handles mixed block sizes)
        terms = [var.slot_count * var.cp_var for var in valid_vars]
        total_slots_expr = sum(terms)
        
        self.cp_model.Add(total_slots_expr <= maximum)

    def _apply_consecutive_required(self, descriptor: ConstraintDescriptor) -> None:
        variables = self._assignment_variables(descriptor.get("variables", []))
        if len(variables) <= 1:
            return
        vars_sorted = sorted(variables, key=lambda var: var.slot_index)
        starts = []
        ends = []

        prev_var: cp_model.IntVar | None = None
        for assignment in vars_sorted:
            var = assignment.cp_var
            if var is None:
                continue
            if prev_var is None:
                start = var
            else:
                start = self.cp_model.NewBoolVar(f"start::{assignment.key}")
                self.cp_model.Add(start <= var)
                self.cp_model.Add(start + prev_var <= 1)
                self.cp_model.Add(start + prev_var >= var)
            starts.append(start)
            prev_var = var

        next_var: cp_model.IntVar | None = None
        for assignment in reversed(vars_sorted):
            var = assignment.cp_var
            if var is None:
                continue
            if next_var is None:
                end = var
            else:
                end = self.cp_model.NewBoolVar(f"end::{assignment.key}")
                self.cp_model.Add(end <= var)
                self.cp_model.Add(end + next_var <= 1)
                self.cp_model.Add(end + next_var >= var)
            ends.append(end)
            next_var = var

        ends.reverse()
        if starts and ends:
            self.cp_model.Add(sum(starts) <= 1)
            self.cp_model.Add(sum(ends) <= 1)
            self.cp_model.Add(sum(starts) == sum(ends))

    def _apply_block_size(self, descriptor: ConstraintDescriptor) -> None:
        vars_ = self._vars(descriptor.get("variables", []))
        if len(vars_) != 2:
            return
        self.cp_model.Add(vars_[0] == vars_[1])

    # ------------------------------------------------------------------
    # Objective helpers
    # ------------------------------------------------------------------
    def _apply_linear_objective(self, descriptor: ObjectiveDescriptor) -> None:
        key = descriptor.get("variableKey")
        coefficient = float(descriptor.get("coefficient", 0))
        var = self._var(key)
        if var is None:
            return
        scaled = int(round(coefficient * self.objective_scale))
        if scaled == 0:
            return
        self._objective_linear_terms.append((scaled, var))

    def _apply_consecutive_objective(self, descriptor: ObjectiveDescriptor) -> None:
        keys = descriptor.get("variableKeys", [])
        if len(keys) != 2:
            return
        var_a = self._var(keys[0])
        var_b = self._var(keys[1])
        if var_a is None or var_b is None:
            return
        aux = self.cp_model.NewBoolVar(f"pair::{keys[0]}::{keys[1]}")
        self.cp_model.Add(aux <= var_a)
        self.cp_model.Add(aux <= var_b)
        self.cp_model.Add(aux >= var_a + var_b - 1)
        coefficient = float(descriptor.get("weight", 0))
        scaled = int(round(coefficient * self.objective_scale))
        if scaled == 0:
            return
        self._objective_linear_terms.append((scaled, aux))

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------
    def _vars(self, keys: List[str]) -> List[cp_model.IntVar]:
        vars_: List[cp_model.IntVar] = []
        for key in keys:
            assignment = self.variable_bundle.slot_variables.get(key)
            if assignment and assignment.cp_var is not None:
                vars_.append(assignment.cp_var)
        return vars_

    def _assignment_variables(self, keys: List[str]) -> List[AssignmentVariable]:
        records: List[AssignmentVariable] = []
        for key in keys:
            assignment = self.variable_bundle.slot_variables.get(key)
            if assignment:
                records.append(assignment)
        return records

    def _var(self, key: Optional[str]) -> Optional[cp_model.IntVar]:
        if key is None:
            return None
        assignment = self.variable_bundle.slot_variables.get(key)
        return assignment.cp_var if assignment else None


def build_constraint_system(
    solver_input: Dict[str, Any],
    grid: TimeGrid,
    variable_bundle: VariableBundle,
) -> ModelEnvelope:
    model = ModelEnvelope(variable_bundle=variable_bundle)
    role_lookup = {role["id"]: role for role in solver_input.get("roles", [])}
    crew_lookup = {str(c["id"]): c for c in solver_input.get("crew", [])}
    
    # Store lookups on model for friendly error messages
    model.role_lookup = role_lookup
    model.crew_lookup = crew_lookup

    crew_slot_map = _index_variables_by_crew_and_slot(variable_bundle)
    role_hour_map = _index_variables_by_role_and_hour(variable_bundle)
    role_slot_map = _index_variables_by_role_and_slot(variable_bundle)
    role_crew_map = _index_variables_by_role_and_crew(variable_bundle)
    role_crew_slot_map = _index_variables_by_role_crew_and_slot(variable_bundle)

    _build_guardrail_constraints(model, solver_input, crew_slot_map, grid)
    _build_hourly_constraints(model, solver_input, role_lookup, role_hour_map, grid)
    _build_window_constraints(model, solver_input, role_lookup, role_slot_map, grid)
    _build_daily_constraints(model, solver_input, role_lookup, role_crew_map, grid)
    # Block size is now implicit in variable structure - no separate constraint needed
    _build_role_bounds(model, role_lookup, role_crew_map, grid)
    # _build_consecutive_constraints(model, role_lookup, role_crew_map, grid)

    _audit_role_quotas(solver_input, grid)
    
    # Check aggregate capacity per hour - total requirements vs total crew available
    _check_aggregate_hourly_capacity(model, solver_input, role_lookup, grid)
    
    # INTENSE DEBUG: Print everything about the constraint system
    _intense_debug(model, solver_input, role_lookup, crew_lookup, grid, variable_bundle,
                   role_hour_map, role_crew_map)

    return model


def build_constraint_system_partial(
    solver_input: Dict[str, Any],
    grid: TimeGrid,
    variable_bundle: VariableBundle,
    *,
    include_guardrail: bool = True,
    include_hourly: bool = True,
    include_window: bool = True,
    include_daily: bool = True,
    include_role_min: bool = True,
    include_role_max: bool = True,
) -> ModelEnvelope:
    """Build constraint system with optional constraint types for incremental testing."""
    model = ModelEnvelope(variable_bundle=variable_bundle)
    role_lookup = {role["id"]: role for role in solver_input.get("roles", [])}
    crew_lookup = {str(c["id"]): c for c in solver_input.get("crew", [])}
    
    model.role_lookup = role_lookup
    model.crew_lookup = crew_lookup

    crew_slot_map = _index_variables_by_crew_and_slot(variable_bundle)
    role_hour_map = _index_variables_by_role_and_hour(variable_bundle)
    role_slot_map = _index_variables_by_role_and_slot(variable_bundle)
    role_crew_map = _index_variables_by_role_and_crew(variable_bundle)

    if include_guardrail:
        _build_guardrail_constraints(model, solver_input, crew_slot_map, grid)
    if include_hourly:
        _build_hourly_constraints(model, solver_input, role_lookup, role_hour_map, grid)
    if include_window:
        _build_window_constraints(model, solver_input, role_lookup, role_slot_map, grid)
    if include_daily:
        _build_daily_constraints(model, solver_input, role_lookup, role_crew_map, grid)
    
    # Role bounds with optional skip
    _build_role_bounds(model, role_lookup, role_crew_map, grid, 
                       skip_min=not include_role_min, 
                       skip_max=not include_role_max)

    return model


def _intense_debug(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    crew_lookup: Dict[str, Dict[str, Any]],
    grid: TimeGrid,
    variable_bundle,
    role_hour_map: Dict[int, Dict[int, List[str]]],
    role_crew_map: Dict[int, Dict[str, List[str]]],
) -> None:
    """INTENSE DEBUG: Print everything about constraints and variables."""
    print("\n" + "="*80, file=sys.stderr)
    print("INTENSE CONSTRAINT DEBUG", file=sys.stderr)
    print("="*80, file=sys.stderr)
    
    # 1. Summary of roles
    print("\n--- ROLES ---", file=sys.stderr)
    for role_id, role in role_lookup.items():
        print(f"  {role.get('displayName', role_id)} (id={role_id}): "
              f"assignmentModels={role.get('assignmentModels')}, "
              f"minSlots={role.get('minSlots')}, maxSlots={role.get('maxSlots')}, "
              f"blockSize={role.get('blockSize')}", file=sys.stderr)
    
    # 2. Summary of constraints by family
    print("\n--- CONSTRAINT COUNTS ---", file=sys.stderr)
    for family, constraints in model.constraints.items():
        print(f"  {family}: {len(constraints)} constraints", file=sys.stderr)
    
    # 3. Hourly constraints detail
    print("\n--- HOURLY CONSTRAINTS DETAIL ---", file=sys.stderr)
    for constraint in model.constraints.get("hourly", []):
        role_id = constraint.get("roleId")
        hour = constraint.get("hour")
        required = constraint.get("required")
        var_count = len(constraint.get("variables", []))
        role_name = role_lookup.get(role_id, {}).get("displayName", f"Role {role_id}")
        status = "✓" if var_count >= required else "✗ INSUFFICIENT"
        print(f"  {role_name} @ hour {hour}: required={required}, variables={var_count} {status}", file=sys.stderr)
    
    # 4. Window constraints detail
    print("\n--- WINDOW CONSTRAINTS DETAIL ---", file=sys.stderr)
    for constraint in model.constraints.get("window", []):
        role_id = constraint.get("roleId")
        slot_idx = constraint.get("slotIndex")
        required = constraint.get("requiredPerBlock")
        var_count = len(constraint.get("variables", []))
        window_range = constraint.get("windowRange", [])
        role_name = role_lookup.get(role_id, {}).get("displayName", f"Role {role_id}")
        status = "✓" if var_count >= required else "✗ INSUFFICIENT"
        print(f"  {role_name} @ slot {slot_idx} (window {window_range}): required={required}, variables={var_count} {status}", file=sys.stderr)
    
    # 5. Daily constraints detail  
    print("\n--- DAILY CONSTRAINTS DETAIL ---", file=sys.stderr)
    for constraint in model.constraints.get("daily", []):
        role_id = constraint.get("roleId")
        crew_id = constraint.get("crewId")
        required_slots = constraint.get("requiredSlots")
        var_count = len(constraint.get("variables", []))
        role_name = role_lookup.get(role_id, {}).get("displayName", f"Role {role_id}")
        crew_name = crew_lookup.get(str(crew_id), {}).get("name", f"Crew {crew_id}")
        status = "✓" if var_count >= required_slots else "✗ INSUFFICIENT"
        print(f"  {crew_name} needs {required_slots} slots of {role_name}: has {var_count} vars {status}", file=sys.stderr)
    
    # 6. Role min/max constraints
    print("\n--- ROLE MIN CONSTRAINTS ---", file=sys.stderr)
    role_min_insufficient = 0
    for constraint in model.constraints.get("role_min", []):
        role_id = constraint.get("roleId")
        crew_id = constraint.get("crewId")
        min_slots = constraint.get("minSlots")
        var_count = len(constraint.get("variables", []))
        role_name = role_lookup.get(role_id, {}).get("displayName", f"Role {role_id}")
        crew_name = crew_lookup.get(str(crew_id), {}).get("name", f"Crew {crew_id}")
        if var_count < min_slots:
            role_min_insufficient += 1
            print(f"  ✗ {crew_name} needs min {min_slots} of {role_name} but only has {var_count} vars", file=sys.stderr)
    if role_min_insufficient == 0:
        print(f"  All {len(model.constraints.get('role_min', []))} role_min constraints satisfiable", file=sys.stderr)
    else:
        print(f"  {role_min_insufficient} role_min constraints CANNOT be satisfied!", file=sys.stderr)
    
    # 7. Guardrail constraints (one task per slot) - just count
    print("\n--- GUARDRAIL CONSTRAINTS ---", file=sys.stderr)
    guardrail_count = len(model.constraints.get("guardrail", []))
    print(f"  {guardrail_count} one-task-per-slot constraints", file=sys.stderr)
    
    # 8. Check for impossible situations: sum of min requirements > crew capacity
    print("\n--- FEASIBILITY CHECK ---", file=sys.stderr)
    
    # Per-hour analysis: can we satisfy hourly reqs + window reqs + min role reqs?
    from collections import defaultdict
    
    # Count variables per role per hour
    vars_by_role_hour: Dict[int, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for var in variable_bundle.slot_variables.values():
        hour = var.start_minute // 60
        vars_by_role_hour[var.role_id][hour] += 1
    
    # For each hour, compute: (hourly req) + (window req at that hour) vs crew available
    hourly_reqs: Dict[int, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for req in solver_input.get("hourlyRequirements", []):
        hourly_reqs[req["hour"]][req["roleId"]] = req["required"]
    
    window_reqs_by_hour: Dict[int, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for req in solver_input.get("windowRequirements", []):
        for hour in range(req["startHour"], req["endHour"]):
            window_reqs_by_hour[hour][req["roleId"]] = req["requiredPerHour"]
    
    # Crew available per hour
    crew_per_hour: Dict[int, set] = defaultdict(set)
    for crew in solver_input.get("crew", []):
        crew_id = crew["id"]
        window = grid.crew_windows.get(crew_id)
        if not window:
            continue
        for slot_index in window.slot_indexes:
            slot = grid.slots[slot_index] if slot_index < len(grid.slots) else None
            if slot:
                hour = slot.start_minute // 60
                crew_per_hour[hour].add(crew_id)
    
    all_hours = sorted(set(hourly_reqs.keys()) | set(window_reqs_by_hour.keys()) | set(crew_per_hour.keys()))
    
    print("  Hour | Crew | HrlyReq | WinReq | Total | Status", file=sys.stderr)
    print("  -----|------|---------|--------|-------|-------", file=sys.stderr)
    for hour in all_hours:
        crew_count = len(crew_per_hour.get(hour, set()))
        hrly_total = sum(hourly_reqs.get(hour, {}).values())
        win_total = sum(window_reqs_by_hour.get(hour, {}).values())
        total_req = hrly_total + win_total
        status = "✓" if total_req <= crew_count else "✗ OVER"
        print(f"  {hour:4} | {crew_count:4} | {hrly_total:7} | {win_total:6} | {total_req:5} | {status}", file=sys.stderr)
    
    # 9. Infeasibility warnings
    if model.infeasibility_warnings:
        print("\n--- INFEASIBILITY WARNINGS ---", file=sys.stderr)
        for warning in model.infeasibility_warnings:
            print(f"  ⚠️ {warning}", file=sys.stderr)
    
    print("\n" + "="*80, file=sys.stderr)
    print("END INTENSE DEBUG", file=sys.stderr)
    print("="*80 + "\n", file=sys.stderr)
    
    # DEEP DIVE: Hours 8 and 9
    _debug_hours_8_and_9(model, solver_input, role_lookup, crew_lookup, grid, variable_bundle, role_hour_map, role_crew_map)


def _debug_hours_8_and_9(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    crew_lookup: Dict[str, Dict[str, Any]],
    grid: TimeGrid,
    variable_bundle,
    role_hour_map: Dict[int, Dict[int, List[str]]],
    role_crew_map: Dict[int, Dict[str, List[str]]],
) -> None:
    """DEEP DIVE DEBUG: Analyze hours 8 and 9 in extreme detail."""
    from collections import defaultdict
    
    print("\n" + "#"*80, file=sys.stderr)
    print("DEEP DIVE: HOURS 8 AND 9 ANALYSIS", file=sys.stderr)
    print("#"*80, file=sys.stderr)
    
    TARGET_HOURS = [8, 9]
    
    # 1. Get all crew working at hours 8 and 9
    crew_at_hour: Dict[int, set] = defaultdict(set)
    for crew in solver_input.get("crew", []):
        crew_id = crew["id"]
        window = grid.crew_windows.get(crew_id)
        if not window:
            continue
        for slot_index in window.slot_indexes:
            slot = grid.slots[slot_index] if slot_index < len(grid.slots) else None
            if slot:
                hour = slot.start_minute // 60
                if hour in TARGET_HOURS:
                    crew_at_hour[hour].add(crew_id)
    
    for hour in TARGET_HOURS:
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"HOUR {hour}:00 - {hour+1}:00", file=sys.stderr)
        print(f"{'='*60}", file=sys.stderr)
        
        crew_ids = sorted(crew_at_hour.get(hour, set()))
        print(f"\n  CREW WORKING: {len(crew_ids)} people", file=sys.stderr)
        
        # 2. For each crew, show what roles they're eligible for at this hour
        print(f"\n  CREW -> ELIGIBLE ROLES AT HOUR {hour}:", file=sys.stderr)
        crew_role_options: Dict[str, List[str]] = {}
        
        for crew_id in crew_ids:
            crew = crew_lookup.get(str(crew_id), {})
            crew_name = crew.get("name", f"Crew {crew_id}")
            
            # Find all variables for this crew at this hour
            eligible_roles = []
            for var_key, var in variable_bundle.slot_variables.items():
                if var.crew_id == crew_id:
                    var_hour = var.start_minute // 60
                    if var_hour == hour:
                        role = role_lookup.get(var.role_id, {})
                        role_name = role.get("displayName", f"Role {var.role_id}")
                        role_code = role.get("code", "?")
                        eligible_roles.append(f"{role_code}")
            
            crew_role_options[crew_id] = eligible_roles
            role_summary = ", ".join(sorted(set(eligible_roles))) if eligible_roles else "NONE!"
            print(f"    {crew_name}: {role_summary}", file=sys.stderr)
        
        # 3. Requirements at this hour
        print(f"\n  REQUIREMENTS AT HOUR {hour}:", file=sys.stderr)
        total_required = 0
        
        # Hourly requirements
        for req in solver_input.get("hourlyRequirements", []):
            if req["hour"] == hour:
                role_id = req["roleId"]
                required = req["required"]
                role = role_lookup.get(role_id, {})
                role_name = role.get("displayName", f"Role {role_id}")
                role_code = role.get("code", "?")
                
                # Count how many crew have this role as an option
                crew_with_role = sum(1 for cid in crew_ids if role_code in crew_role_options.get(cid, []))
                
                status = "✓" if crew_with_role >= required else f"✗ ONLY {crew_with_role} AVAILABLE"
                print(f"    HOURLY: {role_name} ({role_code}): need {required}, {crew_with_role} can do it {status}", file=sys.stderr)
                total_required += required
        
        # Window requirements
        for req in solver_input.get("windowRequirements", []):
            start_h = req["startHour"]
            end_h = req["endHour"]
            if start_h <= hour < end_h:
                role_id = req["roleId"]
                required = req["requiredPerHour"]
                role = role_lookup.get(role_id, {})
                role_name = role.get("displayName", f"Role {role_id}")
                role_code = role.get("code", "?")
                
                crew_with_role = sum(1 for cid in crew_ids if role_code in crew_role_options.get(cid, []))
                
                status = "✓" if crew_with_role >= required else f"✗ ONLY {crew_with_role} AVAILABLE"
                print(f"    WINDOW: {role_name} ({role_code}): need {required}, {crew_with_role} can do it {status}", file=sys.stderr)
                total_required += required
        
        print(f"\n  TOTAL REQUIRED: {total_required}, CREW AVAILABLE: {len(crew_ids)}", file=sys.stderr)
        if total_required > len(crew_ids):
            print(f"  ⚠️ IMPOSSIBLE: Need {total_required} but only {len(crew_ids)} crew!", file=sys.stderr)
        
        # 4. Check role_min constraints for crew at this hour
        print(f"\n  ROLE_MIN CONSTRAINTS FOR CREW AT HOUR {hour}:", file=sys.stderr)
        for crew_id in crew_ids:
            crew = crew_lookup.get(str(crew_id), {})
            crew_name = crew.get("name", f"Crew {crew_id}")
            
            # Find role_min constraints for this crew
            mins = []
            for constraint in model.constraints.get("role_min", []):
                if constraint.get("crewId") == crew_id:
                    role_id = constraint.get("roleId")
                    min_slots = constraint.get("minSlots")
                    role = role_lookup.get(role_id, {})
                    role_code = role.get("code", "?")
                    mins.append(f"{role_code}≥{min_slots}")
            
            if mins:
                print(f"    {crew_name}: {', '.join(mins)}", file=sys.stderr)
        
        # 5. Show the actual constraint model implications
        print(f"\n  CONSTRAINT INTERACTION ANALYSIS:", file=sys.stderr)
        
        # For each crew at this hour, compute: how many slots do their role_mins consume?
        total_min_slots_needed = 0
        for crew_id in crew_ids:
            crew_min_total = 0
            for constraint in model.constraints.get("role_min", []):
                if constraint.get("crewId") == crew_id:
                    crew_min_total += constraint.get("minSlots", 0)
            total_min_slots_needed += crew_min_total
        
        # How many slot-assignments are available at this hour?
        # Each crew has 2 slots per hour (30 min each)
        total_slots_at_hour = len(crew_ids) * 2
        
        print(f"    Total crew: {len(crew_ids)}", file=sys.stderr)
        print(f"    Total slots at hour (crew * 2): {total_slots_at_hour}", file=sys.stderr)
        print(f"    Total required for all roles: {total_required}", file=sys.stderr)
    
    # 6. MATHEMATICAL FEASIBILITY CHECK
    print(f"\n{'='*60}", file=sys.stderr)
    print("MATHEMATICAL FEASIBILITY CHECK", file=sys.stderr)
    print("="*60, file=sys.stderr)
    
    print("\n  The solver must satisfy ALL of these simultaneously:", file=sys.stderr)
    print("  1. Guardrail: Each crew has exactly 1 role per slot", file=sys.stderr)
    print("  2. Hourly: Sum of role assignments == required per hour", file=sys.stderr)
    print("  3. Role_min: Each crew gets at least minSlots of each role", file=sys.stderr)
    print("  4. Role_max: Each crew gets at most maxSlots of each role", file=sys.stderr)
    
    # Check: do role_mins for SOLVER roles (like BREAK) consume too much capacity?
    print("\n  ROLE_MIN CAPACITY ANALYSIS:", file=sys.stderr)
    
    # For each role with role_min, compute total crew * min
    role_min_totals: Dict[int, Dict] = {}
    for role_id, role in role_lookup.items():
        min_slots = role.get("minSlots", 0)
        if min_slots > 0:
            assignment_models = role.get("assignmentModels", [])
            # Count crew with this role
            crew_with_role = len(role_crew_map.get(role_id, {}))
            total_min_needed = crew_with_role * min_slots
            role_min_totals[role_id] = {
                "name": role.get("displayName", f"Role {role_id}"),
                "code": role.get("code", "?"),
                "minSlots": min_slots,
                "crewCount": crew_with_role,
                "totalMinNeeded": total_min_needed,
                "assignmentModels": assignment_models,
                "blockSize": role.get("blockSize", 1),
            }
    
    for role_id, info in role_min_totals.items():
        block_minutes = info["blockSize"] * 30
        total_minutes = info["totalMinNeeded"] * block_minutes
        print(f"    {info['name']}: minSlots={info['minSlots']} × {info['crewCount']} crew = "
              f"{info['totalMinNeeded']} total blocks ({total_minutes} min)", file=sys.stderr)
    
    print("\n" + "#"*80, file=sys.stderr)
    print("END DEEP DIVE", file=sys.stderr)
    print("#"*80 + "\n", file=sys.stderr)


def _check_aggregate_hourly_capacity(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    grid: TimeGrid,
) -> None:
    """Check that total requirements per hour don't exceed total crew available.
    
    This catches cases where individual role requirements look OK, but the sum
    of all requirements at a given hour exceeds the total crew working that hour.
    """
    from collections import defaultdict
    
    # Build requirements per hour from hourly constraints
    hourly_requirements: Dict[int, int] = defaultdict(int)  # hour -> total required
    hourly_role_details: Dict[int, List[tuple]] = defaultdict(list)  # hour -> [(role_name, required)]
    
    for req in solver_input.get("hourlyRequirements", []):
        hour = req["hour"]
        required = req["required"]
        role_id = req["roleId"]
        role = role_lookup.get(role_id, {})
        role_name = role.get("displayName", f"Role {role_id}")
        hourly_requirements[hour] += required
        hourly_role_details[hour].append((role_name, required))
    
    # Add window requirements (convert slot positions to hours)
    for req in solver_input.get("windowRequirements", []):
        role_id = req["roleId"]
        role = role_lookup.get(role_id, {})
        role_name = role.get("displayName", f"Role {role_id}")
        block_size = max(1, int(role.get("blockSize", 1) or 1))
        required_per_block = req["requiredPerHour"]  # Actually per-block
        start_hour = req["startHour"]
        end_hour = req["endHour"]
        
        # For simplicity, count each hour in the window
        for hour in range(int(start_hour), int(end_hour)):
            hourly_requirements[hour] += required_per_block
            hourly_role_details[hour].append((role_name, required_per_block))
    
    # Count crew available per hour
    crew_per_hour: Dict[int, int] = defaultdict(int)
    for crew in solver_input.get("crew", []):
        crew_id = crew["id"]
        window = grid.crew_windows.get(crew_id)
        if not window:
            continue
        # Each slot is 30 min, so slot_index // 2 gives hour offset from day start
        for slot_index in window.slot_indexes:
            slot = grid.slots[slot_index] if slot_index < len(grid.slots) else None
            if slot:
                hour = slot.start_minute // 60
                crew_per_hour[hour] += 1
    
    # Crew per hour counts each crew once per slot, but we want unique crew per hour
    # Actually, we need to count unique crew IDs per hour
    crew_ids_per_hour: Dict[int, set] = defaultdict(set)
    for crew in solver_input.get("crew", []):
        crew_id = crew["id"]
        window = grid.crew_windows.get(crew_id)
        if not window:
            continue
        for slot_index in window.slot_indexes:
            slot = grid.slots[slot_index] if slot_index < len(grid.slots) else None
            if slot:
                hour = slot.start_minute // 60
                crew_ids_per_hour[hour].add(crew_id)
    
    # Check each hour
    for hour, total_required in hourly_requirements.items():
        available = len(crew_ids_per_hour.get(hour, set()))
        if total_required > available:
            # Build breakdown of requirements
            role_breakdown = ", ".join(f"{name}: {count}" for name, count in hourly_role_details[hour])
            model.infeasibility_warnings.append(
                f"At {hour}:00, total coverage requirements ({total_required}) exceed available crew ({available}). "
                f"Requirements: {role_breakdown}."
            )


def _build_guardrail_constraints(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    crew_slot_map: Dict[str, Dict[int, List[str]]],
    grid: TimeGrid,
) -> None:
    crews: List[Dict[str, Any]] = solver_input.get("crew", [])
    
    for crew in crews:
        crew_id = crew["id"]
        window: Optional[CrewShiftWindow] = grid.crew_windows.get(crew_id)
        if not window:
            continue
        for slot_index in window.slot_indexes:
            keys = crew_slot_map.get(crew_id, {}).get(slot_index, [])
            
            # Validate: every slot must have at least one eligible role
            if not keys:
                slot = grid.slots[slot_index] if slot_index < len(grid.slots) else None
                model.uncovered_slots.append({
                    "crewId": crew_id,
                    "crewName": crew.get("name", crew_id),
                    "slotIndex": slot_index,
                    "slotTime": f"{slot.start_minute // 60}:{slot.start_minute % 60:02d}" if slot else "unknown",
                })
                continue  # Skip adding constraint for uncovered slot
            
            model.add_constraint(
                "guardrail",
                {
                    "crewId": crew_id,
                    "slotIndex": slot_index,
                    "variables": keys,
                    "type": "one_task_per_slot",
                },
            )
    
    # Report uncovered slots if any found
    if model.uncovered_slots:
        print(f"\n=== COVERAGE GAP: {len(model.uncovered_slots)} crew-slots have no eligible roles ===", file=sys.stderr)
        for gap in model.uncovered_slots[:10]:  # Show first 10
            print(f"  {gap['crewName']} (id={gap['crewId']}) at slot {gap['slotIndex']} ({gap['slotTime']})", file=sys.stderr)
        if len(model.uncovered_slots) > 10:
            print(f"  ... and {len(model.uncovered_slots) - 10} more", file=sys.stderr)
        print("=== END COVERAGE GAP ===\n", file=sys.stderr)


def _build_hourly_constraints(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    role_hour_map: Dict[int, Dict[int, List[str]]],
    grid: TimeGrid,
) -> None:
    """Build hourly coverage constraints.
    
    Each variable represents one person working that hour.
    Constraint: number of people working == required per hour.
    """
    requirements: List[Dict[str, Any]] = solver_input.get("hourlyRequirements", [])
    
    for requirement in requirements:
        role_id = requirement["roleId"]
        hour = requirement["hour"]
        role = role_lookup.get(role_id)
        if not role:
            continue
        
        required = requirement["required"]  # People needed per hour
        keys = role_hour_map.get(role_id, {}).get(hour, [])
        
        model.add_constraint(
            "hourly",
            {
                "roleId": role_id,
                "hour": hour,
                "required": required,
                "variables": keys,
            },
        )
    _audit_register_hourly_capacity(
        model,
        solver_input,
        role_lookup,
        role_hour_map,
        grid,
    )


def _build_window_constraints(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    role_slot_map: Dict[int, Dict[int, List[str]]],
    grid: TimeGrid,
) -> None:
    """Build window coverage constraints.
    
    requiredPerHour actually means requiredPerBlock - at each block position within
    the window, we require that many people assigned.
    
    For blockSize=2 (1hr): iterates by hour positions
    For blockSize=1 (30min): iterates by 30-min slot positions
    
    Blocks don't overlap - each block position is independent.
    """
    requirements: List[Dict[str, Any]] = solver_input.get("windowRequirements", [])
    
    for requirement in requirements:
        role_id = requirement["roleId"]
        role = role_lookup.get(role_id)
        if not role:
            continue
        
        block_size = max(1, int(role.get("blockSize", 1) or 1))
        required_per_block = requirement["requiredPerHour"]  # Actually per-block
        
        # Convert window hours to minutes, then to slot indices using grid
        start_hour = requirement["startHour"]
        end_hour = requirement["endHour"]
        start_minute = start_hour * 60
        end_minute = end_hour * 60
        
        # Convert to slot indices relative to grid's day_start_minute
        start_slot = grid.minute_to_slot_index(start_minute)
        end_slot = grid.minute_to_slot_index(end_minute)
        
        if start_slot is None or end_slot is None:
            # Window outside grid range
            continue
        
        # Iterate by block_size to get non-overlapping block positions
        slot_position = start_slot
        while slot_position < end_slot:
            # Align to block boundary
            if slot_position % block_size != 0:
                slot_position += block_size - (slot_position % block_size)
                if slot_position >= end_slot:
                    break
            
            keys = role_slot_map.get(role_id, {}).get(slot_position, [])
            
            model.add_constraint(
                "window",
                {
                    "roleId": role_id,
                    "slotIndex": slot_position,
                    "blockSize": block_size,
                    "windowRange": [start_hour, end_hour],
                    "requiredPerBlock": required_per_block,
                    "variables": keys,
                },
            )
            
            slot_position += block_size


def _build_daily_constraints(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    role_crew_map: Dict[int, Dict[str, List[str]]],
    grid: TimeGrid,
) -> None:
    """Build daily requirement constraints.
    
    Daily requirements are in minutes, converted to blocks.
    """
    # Build crew lookup for friendly names (use str keys for consistency)
    crew_lookup: Dict[str, Dict[str, Any]] = {
        str(c["id"]): c for c in solver_input.get("crew", [])
    }
    
    requirements: List[Dict[str, Any]] = solver_input.get("dailyRequirements", [])
    for requirement in requirements:
        role_id = requirement["roleId"]
        crew_id = requirement["crewId"]
        role = role_lookup.get(role_id)
        if not role:
            continue
        
        block_size = max(1, int(role.get("blockSize", 1) or 1))
        required_slots = ceil(requirement["requiredMinutes"] / grid.base_slot_minutes)
        keys = role_crew_map.get(role_id, {}).get(crew_id, [])
        
        # Check if this constraint is satisfiable
        if len(keys) * block_size < required_slots:
            crew = crew_lookup.get(str(crew_id), {})
            crew_name = crew.get("name", f"Crew {crew_id}")
            role_name = role.get("displayName", f"Role {role_id}")
            required_hours = requirement["requiredMinutes"] / 60
            available_hours = (len(keys) * block_size * grid.base_slot_minutes) / 60
            model.infeasibility_warnings.append(
                f"{crew_name}'s daily {role_name} constraint of {required_hours:.1f}h cannot be satisfied - only {available_hours:.1f}h of eligible time slots available in their shift."
            )
        
        model.add_constraint(
            "daily",
            {
                "roleId": role_id,
                "crewId": crew_id,
                "requiredSlots": required_slots,
                "blockSize": block_size,
                "variables": keys,
            },
        )


def _build_role_bounds(
    model: ModelEnvelope,
    role_lookup: Dict[int, Dict[str, Any]],
    role_crew_map: Dict[int, Dict[str, List[str]]],
    grid: TimeGrid,
    skip_max: bool = False,
    skip_min: bool = False,
) -> None:
    """Build role min/max constraints.
    
    minSlots/maxSlots are treated as block counts (will be renamed later).
    Each variable = 1 block, so sum(vars) >= minSlots.
    """
    # Collect stats for debugging
    role_min_stats: Dict[int, Dict[str, Any]] = {}
    
    for role_id, crew_map in role_crew_map.items():
        role = role_lookup.get(role_id)
        if not role:
            continue
        
        assignment_models = set(role.get("assignmentModels", []))
        is_hourly_role = "HOURLY" in assignment_models
        
        min_blocks = int(role.get("minSlots") or 0)  # Treated as minBlocks
        max_blocks = int(role.get("maxSlots") or 0)  # Treated as maxBlocks
        role_name = role.get("displayName", str(role_id))
        
        if min_blocks > 0:
            total_min_needed = 0
            total_vars = 0
            crews_with_insufficient = 0
            
            for crew_id, keys in crew_map.items():
                total_min_needed += min_blocks
                total_vars += len(keys)
                if len(keys) < min_blocks:
                    crews_with_insufficient += 1
                    crew = model.crew_lookup.get(crew_id, {})
                    crew_name = crew.get("name", f"Crew {crew_id}")
                    min_hours = (min_blocks * grid.base_slot_minutes) / 60
                    available_hours = (len(keys) * grid.base_slot_minutes) / 60
                    model.infeasibility_warnings.append(
                        f"{crew_name} needs at least {min_hours:.1f}h of {role_name} but only has {available_hours:.1f}h of eligible time in their shift."
                    )
            
            role_min_stats[role_id] = {
                "roleName": role_name,
                "minBlocks": min_blocks,
                "crewCount": len(crew_map),
                "totalMinNeeded": total_min_needed,
                "totalVarsAvailable": total_vars,
                "crewsWithInsufficient": crews_with_insufficient,
            }
        
        for crew_id, keys in crew_map.items():
            if min_blocks > 0 and not skip_min:
                model.add_constraint(
                    "role_min",
                    {
                        "roleId": role_id,
                        "crewId": crew_id,
                        "minSlots": min_blocks,
                        "variables": keys,
                    },
                )
            # role_max is fine for all roles
            if max_blocks > 0 and not skip_max:
                model.add_constraint(
                    "role_max",
                    {
                        "roleId": role_id,
                        "crewId": crew_id,
                        "maxSlots": max_blocks,
                        "variables": keys,
                    },
                )
    
    # Print summary and save to model
    if role_min_stats:
        model.role_min_stats = role_min_stats
        print("\n=== Role Min Stats ===", file=sys.stderr)
        for role_id, stats in role_min_stats.items():
            print(f"  {stats['roleName']}: minBlocks={stats['minBlocks']}, crews={stats['crewCount']}, "
                  f"totalMinNeeded={stats['totalMinNeeded']}, totalVarsAvailable={stats['totalVarsAvailable']}, "
                  f"insufficient={stats['crewsWithInsufficient']}", file=sys.stderr)
        print("=== End Role Min Stats ===\n", file=sys.stderr)

def _build_consecutive_constraints(
    model: ModelEnvelope,
    role_lookup: Dict[int, Dict[str, Any]],
    role_crew_map: Dict[int, Dict[str, List[str]]],
    grid: TimeGrid,
) -> None:
    for role_id, crew_map in role_crew_map.items():
        role = role_lookup.get(role_id)
        if not role:
            continue
        policy = role.get("consecutivePolicy")
        if not policy or policy == "NONE":
            continue
        for crew_id, keys in crew_map.items():
            descriptor = {
                "roleId": role_id,
                "crewId": crew_id,
                "variables": keys,
                "policy": policy,
                "blockSize": max(1, int(role.get("blockSize", 1) or 1)),
            }
            family = "consecutive_required" if policy == "REQUIRED" else "consecutive_preferred"
            model.add_constraint(family, descriptor)


def _audit_register_hourly_capacity(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    role_hour_map: Dict[int, Dict[int, List[str]]],
    grid: TimeGrid,
) -> None:
    roles = solver_input.get("roles", [])
    register_role_ids = {
        role["id"]
        for role in roles
        if str(role.get("code", "")).upper() == "REG"
        or str(role.get("displayName", "")).strip().lower() == "register"
    }
    if not register_role_ids:
        return

    requirements = [
        requirement
        for requirement in solver_input.get("hourlyRequirements", [])
        if requirement.get("roleId") in register_role_ids
    ]
    if not requirements:
        return

    slots_per_hour = max(1, 60 // grid.base_slot_minutes)
    _audit_print("\n=== Register Hourly Capacity Audit ===")
    _audit_print("hour | eligCrew | eligSlots | reqCrew | reqSlots")
    slot_vars = model.variable_bundle.slot_variables

    for requirement in sorted(requirements, key=lambda r: (r.get("roleId"), r.get("hour"))):
        role_id = requirement.get("roleId")
        hour = requirement.get("hour")
        keys = role_hour_map.get(role_id, {}).get(hour, [])
        eligible_crews = {
            slot_vars[key].crew_id
            for key in keys
            if key in slot_vars
        }
        eligible_slots = len(keys)
        required_crews = requirement.get("required", 0)
        required_slots = required_crews * slots_per_hour
        display_name = role_lookup.get(role_id, {}).get("displayName", role_id)
        _audit_print(
            f"{display_name} h{hour:02d} | "
            f"eligCrew={len(eligible_crews):>3} | eligSlots={eligible_slots:>3} | "
            f"reqCrew={required_crews:>3} | reqSlots={required_slots:>3}"
        )

def _audit_role_quotas(solver_input: Dict[str, Any], grid: TimeGrid) -> None:
    roles = solver_input.get("roles", [])
    crews = solver_input.get("crew", [])
    slots_per_hour = max(1, 60 // grid.base_slot_minutes)

    crew_counts: DefaultDict[int, int] = defaultdict(int)
    for crew in crews:
        for role_id in crew.get("roleIds", []):
            crew_counts[role_id] += 1

    hourly_slots: DefaultDict[int, int] = defaultdict(int)
    for requirement in solver_input.get("hourlyRequirements", []):
        hourly_slots[requirement["roleId"]] += requirement["required"] * slots_per_hour

    window_slots: DefaultDict[int, int] = defaultdict(int)
    for window in solver_input.get("windowRequirements", []):
        hours = max(0, int(window["endHour"] - window["startHour"]))
        window_slots[window["roleId"]] += window["requiredPerHour"] * hours * slots_per_hour

    daily_slots: DefaultDict[int, int] = defaultdict(int)
    for requirement in solver_input.get("dailyRequirements", []):
        required_slots = ceil(requirement["requiredMinutes"] / grid.base_slot_minutes)
        daily_slots[requirement["roleId"]] += required_slots

    printed_header = False
    for role in roles:
        min_slots = int(role.get("minSlots") or 0)
        if min_slots <= 0:
            continue
        assignment_models = role.get("assignmentModels", [])
        if assignment_models and all(model == "SOLVER" for model in assignment_models):
            continue

        crew_count = crew_counts.get(role["id"], 0)
        if crew_count == 0:
            continue

        min_total = min_slots * crew_count
        max_slots = int(role.get("maxSlots") or 0)
        max_total = max_slots * crew_count if max_slots > 0 else None
        hourly = hourly_slots.get(role["id"], 0)
        window = window_slots.get(role["id"], 0)
        daily = daily_slots.get(role["id"], 0)
        demanded = hourly + window + daily
        min_gap = min_total - demanded
        max_gap = demanded - max_total if max_total else None

        if not printed_header:
            _audit_print("\n=== Role Quota Audit ===")
            printed_header = True

        max_total_display = f"{max_total}" if max_total is not None else "∞"
        max_gap_display = f"{max_gap}" if max_gap is not None else "n/a"
        _audit_print(
            f"{role['displayName']} ({role['id']}): crew={crew_count}, minTot={min_total}, "
            f"maxTot={max_total_display}, demand={demanded}"
        )
        _audit_print(
            f"    hourly={hourly}, window={window}, daily={daily}, minGap={min_gap}, "
            f"maxGap={max_gap_display}"
        )


def _audit_print(message: str) -> None:
    print(message, file=sys.stderr)

def _build_block_size_constraints(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    role_lookup: Dict[int, Dict[str, Any]],
    role_crew_slot_map: Dict[int, Dict[str, Dict[int, str]]],
    grid: TimeGrid,
) -> None:
    block_stats: Dict[int, Dict[str, Any]] = {}
    
    for role_id, crew_slot_map in role_crew_slot_map.items():
        role = role_lookup.get(role_id)
        if not role:
            continue
        block_size = max(1, int(role.get("blockSize", 1) or 1))
        if block_size <= 1:
            continue
        
        role_name = role.get("displayName", str(role_id))
        blocks_created = 0
        crews_with_blocks = 0
        
        for crew_id, slot_map in crew_slot_map.items():
            window: Optional[CrewShiftWindow] = grid.crew_windows.get(crew_id)
            if not window:
                continue
            slot_start = window.slot_start
            slot_end = window.slot_end
            current = slot_start
            crew_blocks = 0
            while current + block_size <= slot_end:
                keys: List[str] = []
                slots: List[int] = []
                for offset in range(block_size):
                    slot_index = current + offset
                    key = slot_map.get(slot_index)
                    if not key:
                        keys = []
                        break
                    keys.append(key)
                    slots.append(slot_index)
                if len(keys) == block_size:
                    crew_blocks += 1
                    for idx in range(1, len(keys)):
                        model.add_constraint(
                            "block_size",
                            {
                                "roleId": role_id,
                                "crewId": crew_id,
                                "slotPair": [slots[idx - 1], slots[idx]],
                                "variables": [keys[idx - 1], keys[idx]],
                            },
                        )
                current += block_size
            if crew_blocks > 0:
                crews_with_blocks += 1
                blocks_created += crew_blocks
        
        if blocks_created > 0:
            block_stats[role_id] = {
                "roleName": role_name,
                "blockSize": block_size,
                "crewsWithBlocks": crews_with_blocks,
                "totalBlocks": blocks_created,
            }
    
    # Save to model for output
    if block_stats:
        model.block_size_stats = block_stats
        print("\n=== Block Size Stats ===", file=sys.stderr)
        for role_id, stats in block_stats.items():
            print(f"  {stats['roleName']}: blockSize={stats['blockSize']}, "
                  f"crews={stats['crewsWithBlocks']}, blocks={stats['totalBlocks']}", file=sys.stderr)
        print("=== End Block Size Stats ===\n", file=sys.stderr)


def _index_variables_by_crew_and_slot(
    variable_bundle: VariableBundle,
) -> Dict[str, Dict[int, List[str]]]:
    """Index variables by crew and slot.
    
    For block-based variables, each variable is indexed under ALL slots it covers.
    A blockSize=2 variable starting at slot 5 will appear under slots 5 AND 6.
    """
    crew_slot_map: DefaultDict[str, DefaultDict[int, List[str]]] = DefaultDict(lambda: DefaultDict(list))
    for key, variable in variable_bundle.slot_variables.items():
        # Index under all slots this block covers
        for slot_idx in variable.slot_indexes:
            crew_slot_map[variable.crew_id][slot_idx].append(key)
    return {crew: dict(slot_map) for crew, slot_map in crew_slot_map.items()}


def _index_variables_by_role_and_hour(
    variable_bundle: VariableBundle,
) -> Dict[int, Dict[int, List[str]]]:
    """Index variables by role and hour.
    
    For block-based variables that span multiple hours, index under all hours covered.
    """
    role_hour_map: DefaultDict[int, DefaultDict[int, List[str]]] = DefaultDict(lambda: DefaultDict(list))
    for key, variable in variable_bundle.slot_variables.items():
        role_hour_map[variable.role_id][variable.hour].append(key)
    return {role: dict(hour_map) for role, hour_map in role_hour_map.items()}


def _index_variables_by_role_and_slot(
    variable_bundle: VariableBundle,
) -> Dict[int, Dict[int, List[str]]]:
    """Index variables by role and starting slot index.
    
    For window constraints, we need to know all variables that start at each slot position.
    """
    role_slot_map: DefaultDict[int, DefaultDict[int, List[str]]] = DefaultDict(lambda: DefaultDict(list))
    for key, variable in variable_bundle.slot_variables.items():
        role_slot_map[variable.role_id][variable.slot_index].append(key)
    return {role: dict(slot_map) for role, slot_map in role_slot_map.items()}


def _index_variables_by_role_and_crew(
    variable_bundle: VariableBundle,
) -> Dict[int, Dict[str, List[str]]]:
    role_crew_map: DefaultDict[int, DefaultDict[str, List[str]]] = DefaultDict(lambda: DefaultDict(list))
    for key, variable in variable_bundle.slot_variables.items():
        role_crew_map[variable.role_id][variable.crew_id].append(key)
    return {role: dict(crew_map) for role, crew_map in role_crew_map.items()}


def _index_variables_by_role_crew_and_slot(
    variable_bundle: VariableBundle,
) -> Dict[int, Dict[str, Dict[int, str]]]:
    """Index variables by role, crew, and starting slot."""
    mapping: DefaultDict[int, DefaultDict[str, Dict[int, str]]] = DefaultDict(
        lambda: DefaultDict(dict)
    )
    for key, variable in variable_bundle.slot_variables.items():
        mapping[variable.role_id][variable.crew_id][variable.slot_index] = key
    return {role: {crew: dict(slots) for crew, slots in crew_map.items()} for role, crew_map in mapping.items()}
