"""High-level orchestrator for the metadata-driven solver."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from math import ceil
from typing import Any, Dict, List, Optional

from ortools.sat.python import cp_model

from . import time_grid, variables, constraints, objective


@dataclass
class SolverResult:
    """Structured response from the CP-SAT run."""

    status: str
    success: bool
    objective_value: float
    assignments: List[Dict[str, Any]]
    metadata: Dict[str, Any]


def _test_incremental_feasibility(solver_input: Dict[str, Any], grid, variable_bundle) -> Dict[str, str]:
    """Test constraints incrementally to find which type causes infeasibility.
    
    This creates separate models with different subsets of constraints to isolate
    the problematic constraint type.
    """
    import sys
    results = {}
    
    print("\n" + "="*80, file=sys.stderr)
    print("INCREMENTAL FEASIBILITY TEST", file=sys.stderr)
    print("="*80, file=sys.stderr)
    
    # Test 1: Just guardrail constraints
    print("\n[TEST 1] Guardrail only...", file=sys.stderr)
    cp1 = cp_model.CpModel()
    vb1 = variables.build_assignment_variables(cp1, solver_input, grid)
    model1 = constraints.build_constraint_system_partial(solver_input, grid, vb1, 
        include_guardrail=True, include_hourly=False, include_window=False, 
        include_daily=False, include_role_min=False, include_role_max=False)
    solver1 = cp_model.CpSolver()
    solver1.parameters.max_time_in_seconds = 5.0
    status1 = solver1.Solve(model1.cp_model)
    results["guardrail_only"] = "✓ FEASIBLE" if status1 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "✗ INFEASIBLE"
    print(f"  {results['guardrail_only']}", file=sys.stderr)
    
    # Test 2: Guardrail + Hourly
    print("\n[TEST 2] Guardrail + Hourly...", file=sys.stderr)
    cp2 = cp_model.CpModel()
    vb2 = variables.build_assignment_variables(cp2, solver_input, grid)
    model2 = constraints.build_constraint_system_partial(solver_input, grid, vb2,
        include_guardrail=True, include_hourly=True, include_window=False,
        include_daily=False, include_role_min=False, include_role_max=False)
    solver2 = cp_model.CpSolver()
    solver2.parameters.max_time_in_seconds = 5.0
    status2 = solver2.Solve(model2.cp_model)
    results["guardrail_hourly"] = "✓ FEASIBLE" if status2 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "✗ INFEASIBLE"
    print(f"  {results['guardrail_hourly']}", file=sys.stderr)
    
    # Test 3: Guardrail + Hourly + Window
    print("\n[TEST 3] Guardrail + Hourly + Window...", file=sys.stderr)
    cp3 = cp_model.CpModel()
    vb3 = variables.build_assignment_variables(cp3, solver_input, grid)
    model3 = constraints.build_constraint_system_partial(solver_input, grid, vb3,
        include_guardrail=True, include_hourly=True, include_window=True,
        include_daily=False, include_role_min=False, include_role_max=False)
    solver3 = cp_model.CpSolver()
    solver3.parameters.max_time_in_seconds = 5.0
    status3 = solver3.Solve(model3.cp_model)
    results["guardrail_hourly_window"] = "✓ FEASIBLE" if status3 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "✗ INFEASIBLE"
    print(f"  {results['guardrail_hourly_window']}", file=sys.stderr)
    
    # Test 4: Guardrail + Hourly + Window + Daily
    print("\n[TEST 4] Guardrail + Hourly + Window + Daily...", file=sys.stderr)
    cp4 = cp_model.CpModel()
    vb4 = variables.build_assignment_variables(cp4, solver_input, grid)
    model4 = constraints.build_constraint_system_partial(solver_input, grid, vb4,
        include_guardrail=True, include_hourly=True, include_window=True,
        include_daily=True, include_role_min=False, include_role_max=False)
    solver4 = cp_model.CpSolver()
    solver4.parameters.max_time_in_seconds = 5.0
    status4 = solver4.Solve(model4.cp_model)
    results["guardrail_hourly_window_daily"] = "✓ FEASIBLE" if status4 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "✗ INFEASIBLE"
    print(f"  {results['guardrail_hourly_window_daily']}", file=sys.stderr)
    
    # Test 5: Guardrail + Hourly + Window + Daily + Role Min
    print("\n[TEST 5] Guardrail + Hourly + Window + Daily + RoleMin...", file=sys.stderr)
    cp5 = cp_model.CpModel()
    vb5 = variables.build_assignment_variables(cp5, solver_input, grid)
    model5 = constraints.build_constraint_system_partial(solver_input, grid, vb5,
        include_guardrail=True, include_hourly=True, include_window=True,
        include_daily=True, include_role_min=True, include_role_max=False)
    solver5 = cp_model.CpSolver()
    solver5.parameters.max_time_in_seconds = 5.0
    status5 = solver5.Solve(model5.cp_model)
    results["guardrail_hourly_window_daily_rolemin"] = "✓ FEASIBLE" if status5 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "✗ INFEASIBLE"
    print(f"  {results['guardrail_hourly_window_daily_rolemin']}", file=sys.stderr)
    
    # Test 6: All constraints
    print("\n[TEST 6] ALL constraints...", file=sys.stderr)
    cp6 = cp_model.CpModel()
    vb6 = variables.build_assignment_variables(cp6, solver_input, grid)
    model6 = constraints.build_constraint_system_partial(solver_input, grid, vb6,
        include_guardrail=True, include_hourly=True, include_window=True,
        include_daily=True, include_role_min=True, include_role_max=True)
    solver6 = cp_model.CpSolver()
    solver6.parameters.max_time_in_seconds = 5.0
    status6 = solver6.Solve(model6.cp_model)
    results["all_constraints"] = "✓ FEASIBLE" if status6 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "✗ INFEASIBLE"
    print(f"  {results['all_constraints']}", file=sys.stderr)
    
    print("\n" + "="*80, file=sys.stderr)
    print("INCREMENTAL TEST RESULTS SUMMARY:", file=sys.stderr)
    for test_name, result in results.items():
        print(f"  {test_name}: {result}", file=sys.stderr)
    print("="*80 + "\n", file=sys.stderr)
    
    return results


class SolverV2Engine:
    """Facade for the end-to-end solver pipeline.

    The ``solve`` method intentionally mirrors the execution order documented in
    SOLVER_REFACTOR_PLAN.md (grid -> variables -> constraints -> objective -> solve).
    Each stage currently delegates to stub helpers so we can fill them in
    incrementally.
    """

    def __init__(self, *, time_limit_seconds: Optional[float] = None) -> None:
        self.time_limit_seconds = time_limit_seconds or 30.0

    def solve(self, solver_input: Dict[str, Any]) -> SolverResult:
        import sys
        from collections import defaultdict
        cp = cp_model.CpModel()
        grid = time_grid.build_time_grid(solver_input)
        variable_bundle = variables.build_assignment_variables(cp, solver_input, grid)
        
        # Debug: analyze capacity per hour before constraint system
        self._debug_hourly_capacity(solver_input, grid, variable_bundle)
        
        model = constraints.build_constraint_system(solver_input, grid, variable_bundle)
        objective.build_objective(model, solver_input, variable_bundle, grid)
        model.commit_objective()

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.time_limit_seconds

        # DEBUG: Print model stats before solving
        num_vars = model.cp_model.Proto().variables.__len__()
        num_constraints = model.cp_model.Proto().constraints.__len__()
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"[PRE-SOLVE DEBUG] Variables: {num_vars}", file=sys.stderr)
        print(f"[PRE-SOLVE DEBUG] Constraints: {num_constraints}", file=sys.stderr)
        # Count constraints by family
        constraint_counts = {k: len(v) for k, v in model.constraints.items()}
        print(f"[PRE-SOLVE DEBUG] Constraint counts by type: {constraint_counts}", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)

        status_code = solver.Solve(model.cp_model)
        success = status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        
        # Debug: print infeasibility warnings
        print(f"[SOLVER_V2 DEBUG] status_code={status_code}, success={success}", file=sys.stderr)
        print(f"[SOLVER_V2 DEBUG] infeasibility_warnings={model.infeasibility_warnings}", file=sys.stderr)
        
        # If infeasible, run incremental test to find the culprit
        if status_code == cp_model.INFEASIBLE:
            print("[SOLVER_V2 DEBUG] Model is INFEASIBLE. Running incremental feasibility test...", file=sys.stderr)
            print(f"[SOLVER_V2 DEBUG] Model has {model.cp_model.Proto().variables.__len__()} variables", file=sys.stderr)
            print(f"[SOLVER_V2 DEBUG] Model has {model.cp_model.Proto().constraints.__len__()} constraints", file=sys.stderr)
            
            # Run incremental test to isolate the problem
            incremental_results = _test_incremental_feasibility(solver_input, grid, variable_bundle)
        
        assignments: List[Dict[str, Any]] = []

        if success:
            assignments = self._extract_assignments(solver, variable_bundle)

        objective_value = 0.0
        if success:
            objective_value = solver.ObjectiveValue() / model.objective_scale

        # Validate constraints against solution
        validation = {}
        if success and assignments:
            validation = self._validate_constraints(assignments, solver_input, grid)

        metadata = {
            "timeLimitSeconds": self.time_limit_seconds,
            "statusCode": status_code,
            "grid": grid.summary(),
            "variableCounts": variable_bundle.summary(),
            "constraintCounts": model.summary(),
            "objectiveScale": model.objective_scale,
            "runtimeMs": int(solver.WallTime() * 1000),
            "uncoveredSlots": model.uncovered_slots[:20] if model.uncovered_slots else [],
            "validation": validation,
            "registerVarsByHour": variable_bundle.metadata.get("register_vars_by_hour", {}),
        }

        return SolverResult(
            status=self._status_label(status_code),
            success=success,
            objective_value=objective_value,
            assignments=assignments,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _extract_assignments(
        self,
        solver: cp_model.CpSolver,
        variable_bundle: variables.VariableBundle,
    ) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        for assignment in variable_bundle.slot_variables.values():
            var = assignment.cp_var
            if var is None:
                continue
            if solver.BooleanValue(var):
                records.append(
                    {
                        "crewId": assignment.crew_id,
                        "roleId": assignment.role_id,
                        "slotIndex": assignment.slot_index,
                        "startMinute": assignment.start_minute,
                        "endMinute": assignment.end_minute,
                    }
                )
        records.sort(key=lambda row: (row["crewId"], row["startMinute"], row["roleId"]))
        return records

    def _validate_constraints(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        grid: time_grid.TimeGrid,
    ) -> Dict[str, Any]:
        """Validate solution against all constraints and return validation report."""
        role_lookup = {r["id"]: r for r in solver_input.get("roles", [])}
        
        validation = {
            "daily": self._validate_daily_constraints(assignments, solver_input, role_lookup, grid),
            "window": self._validate_window_constraints(assignments, solver_input, role_lookup, grid),
            "hourly": self._validate_hourly_constraints(assignments, solver_input, role_lookup, grid),
            "overlap": self._validate_no_overlap(assignments, solver_input, grid),
            "shiftBounds": self._validate_shift_bounds(assignments, solver_input, grid),
            "roleMinMax": self._validate_role_min_max(assignments, solver_input, role_lookup, grid),
            "consecutive": self._validate_consecutive(assignments, solver_input, role_lookup, grid),
        }
        
        # Summary
        all_passed = all(
            all(c.get("satisfied", False) for c in constraints_list)
            for constraints_list in validation.values()
        )
        total_violations = sum(
            sum(1 for c in constraints_list if not c.get("satisfied", False))
            for constraints_list in validation.values()
        )
        
        validation["summary"] = {
            "allPassed": all_passed,
            "totalViolations": total_violations,
            "dailyCount": len(validation["daily"]),
            "windowCount": len(validation["window"]),
            "hourlyCount": len(validation["hourly"]),
            "overlapViolations": len(validation["overlap"]),
            "shiftBoundViolations": len(validation["shiftBounds"]),
            "roleMinMaxCount": len(validation["roleMinMax"]),
            "roleMinMaxViolations": sum(1 for c in validation["roleMinMax"] if not c.get("satisfied", False)),
            "consecutiveCount": len(validation["consecutive"]),
            "consecutiveViolations": sum(1 for c in validation["consecutive"] if not c.get("satisfied", False)),
        }
        
        return validation
    
    def _validate_daily_constraints(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        role_lookup: Dict[int, Dict[str, Any]],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate daily requirements - each crew must get exactly requiredMinutes for each role."""
        results = []
        requirements = solver_input.get("dailyRequirements", [])
        
        # Group assignments by (roleId, crewId) and sum minutes
        assignment_minutes: Dict[tuple, int] = defaultdict(int)
        for a in assignments:
            key = (a["roleId"], a["crewId"])
            assignment_minutes[key] += a["endMinute"] - a["startMinute"]
        
        for req in requirements:
            role_id = req["roleId"]
            crew_id = req["crewId"]
            required_minutes = req["requiredMinutes"]
            actual_minutes = assignment_minutes.get((role_id, crew_id), 0)
            
            role = role_lookup.get(role_id, {})
            satisfied = actual_minutes == required_minutes
            
            results.append({
                "type": "daily",
                "roleId": role_id,
                "roleName": role.get("displayName", str(role_id)),
                "crewId": crew_id,
                "requiredMinutes": required_minutes,
                "actualMinutes": actual_minutes,
                "satisfied": satisfied,
                "message": f"{'✓' if satisfied else '✗'} {role.get('displayName', role_id)}: {actual_minutes}/{required_minutes} min"
            })
        
        return results
    
    def _validate_window_constraints(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        role_lookup: Dict[int, Dict[str, Any]],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate window requirements - each slot in window must have requiredPerHour people."""
        results = []
        requirements = solver_input.get("windowRequirements", [])
        
        for req in requirements:
            role_id = req["roleId"]
            start_hour = req["startHour"]
            end_hour = req["endHour"]
            required_per_block = req["requiredPerHour"]  # Actually per-block
            
            role = role_lookup.get(role_id, {})
            block_size = max(1, int(role.get("blockSize", 1) or 1))
            block_minutes = block_size * 30  # Each slot is 30 min
            
            start_minute = start_hour * 60
            end_minute = end_hour * 60
            
            # Check each block position within the window
            violations = []
            checked_positions = 0
            
            current_minute = start_minute
            while current_minute < end_minute:
                # Count assignments covering this block position
                count = sum(
                    1 for a in assignments
                    if a["roleId"] == role_id
                    and a["startMinute"] == current_minute
                )
                
                checked_positions += 1
                if count != required_per_block:
                    violations.append({
                        "minute": current_minute,
                        "hour": current_minute / 60,
                        "expected": required_per_block,
                        "actual": count,
                    })
                
                current_minute += block_minutes
            
            satisfied = len(violations) == 0
            results.append({
                "type": "window",
                "roleId": role_id,
                "roleName": role.get("displayName", str(role_id)),
                "window": f"{start_hour}:00-{end_hour}:00",
                "requiredPerBlock": required_per_block,
                "blockSize": block_size,
                "checkedPositions": checked_positions,
                "violations": violations[:10],  # First 10 violations
                "violationCount": len(violations),
                "satisfied": satisfied,
                "message": f"{'✓' if satisfied else '✗'} {role.get('displayName', role_id)} window {start_hour}-{end_hour}: {checked_positions - len(violations)}/{checked_positions} positions OK"
            })
        
        return results
    
    def _validate_hourly_constraints(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        role_lookup: Dict[int, Dict[str, Any]],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate hourly requirements - each hour must have required people."""
        results = []
        requirements = solver_input.get("hourlyRequirements", [])
        
        for req in requirements:
            role_id = req["roleId"]
            hour = req["hour"]
            required = req.get("required", req.get("requiredPerHour", 0))
            
            role = role_lookup.get(role_id, {})
            
            # Count assignments that cover this hour
            hour_start = hour * 60
            hour_end = (hour + 1) * 60
            
            count = sum(
                1 for a in assignments
                if a["roleId"] == role_id
                and a["startMinute"] < hour_end
                and a["endMinute"] > hour_start
            )
            
            satisfied = count == required
            results.append({
                "type": "hourly",
                "roleId": role_id,
                "roleName": role.get("displayName", str(role_id)),
                "hour": hour,
                "required": required,
                "actual": count,
                "satisfied": satisfied,
                "message": f"{'✓' if satisfied else '✗'} {role.get('displayName', role_id)} hour {hour}: {count}/{required}"
            })
        
        return results
    
    def _validate_no_overlap(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate that no crew member has overlapping assignments."""
        violations = []
        
        # Group assignments by crew
        crew_assignments: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for a in assignments:
            crew_assignments[a["crewId"]].append(a)
        
        for crew_id, crew_assigns in crew_assignments.items():
            # Sort by start time
            sorted_assigns = sorted(crew_assigns, key=lambda x: x["startMinute"])
            
            for i in range(len(sorted_assigns) - 1):
                current = sorted_assigns[i]
                next_assign = sorted_assigns[i + 1]
                
                # Check if current assignment ends after next starts (overlap)
                if current["endMinute"] > next_assign["startMinute"]:
                    violations.append({
                        "type": "overlap",
                        "crewId": crew_id,
                        "assignment1": {
                            "roleId": current["roleId"],
                            "start": current["startMinute"],
                            "end": current["endMinute"],
                        },
                        "assignment2": {
                            "roleId": next_assign["roleId"],
                            "start": next_assign["startMinute"],
                            "end": next_assign["endMinute"],
                        },
                        "satisfied": False,
                        "message": f"✗ Crew {crew_id}: overlap at {current['startMinute']}-{current['endMinute']} and {next_assign['startMinute']}-{next_assign['endMinute']}"
                    })
        
        return violations
    
    def _validate_shift_bounds(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate that assignments are within crew shift bounds."""
        violations = []
        
        # Build crew shift lookup
        crew_shifts = {}
        for crew in solver_input.get("crew", []):
            crew_shifts[crew["id"]] = {
                "start": crew.get("shiftStartMin", 0),
                "end": crew.get("shiftEndMin", 24 * 60),
            }
        
        for a in assignments:
            crew_id = a["crewId"]
            shift = crew_shifts.get(crew_id)
            if not shift:
                continue
            
            # Check if assignment is within shift
            if a["startMinute"] < shift["start"] or a["endMinute"] > shift["end"]:
                violations.append({
                    "type": "shiftBounds",
                    "crewId": crew_id,
                    "roleId": a["roleId"],
                    "assignmentStart": a["startMinute"],
                    "assignmentEnd": a["endMinute"],
                    "shiftStart": shift["start"],
                    "shiftEnd": shift["end"],
                    "satisfied": False,
                    "message": f"✗ Crew {crew_id}: assignment {a['startMinute']}-{a['endMinute']} outside shift {shift['start']}-{shift['end']}"
                })
        
        return violations

    def _validate_role_min_max(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        role_lookup: Dict[int, Dict[str, Any]],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate minSlots/maxSlots constraints in MINUTES.
        
        minSlots/maxSlots are defined in terms of the role's original blockSize.
        We convert to minutes for consistent validation regardless of block decomposition.
        """
        results = []
        
        # Get eligible crew per role from dailyRequirements
        daily_reqs = solver_input.get("dailyRequirements", [])
        role_crews: Dict[int, set] = defaultdict(set)
        for req in daily_reqs:
            role_crews[req["roleId"]].add(req["crewId"])
        
        # Sum actual minutes per (roleId, crewId)
        actual_minutes_map: Dict[tuple, int] = defaultdict(int)
        for a in assignments:
            actual_minutes_map[(a["roleId"], a["crewId"])] += a["endMinute"] - a["startMinute"]
        
        for role in solver_input.get("roles", []):
            role_id = role["id"]
            min_slots = int(role.get("minSlots") or 0)
            max_slots = int(role.get("maxSlots") or 0)
            role_name = role.get("displayName", str(role_id))
            
            if min_slots == 0 and max_slots == 0:
                continue
            
            # Convert slots to minutes using original blockSize
            # blockSize is in 30-min units, so blockSize=1 -> 30min, blockSize=2 -> 60min
            block_size = max(1, int(role.get("blockSize", 1) or 1))
            slot_minutes = block_size * 30
            
            min_minutes = min_slots * slot_minutes
            max_minutes = max_slots * slot_minutes
            
            # Check each crew that is eligible for this role
            eligible_crews = role_crews.get(role_id, set())
            for crew_id in eligible_crews:
                actual_minutes = actual_minutes_map.get((role_id, crew_id), 0)
                
                min_satisfied = actual_minutes >= min_minutes if min_minutes > 0 else True
                max_satisfied = actual_minutes <= max_minutes if max_minutes > 0 else True
                satisfied = min_satisfied and max_satisfied
                
                results.append({
                    "type": "roleMinMax",
                    "roleId": role_id,
                    "roleName": role_name,
                    "crewId": crew_id,
                    "minMinutes": min_minutes,
                    "maxMinutes": max_minutes,
                    "actualMinutes": actual_minutes,
                    "minSatisfied": min_satisfied,
                    "maxSatisfied": max_satisfied,
                    "satisfied": satisfied,
                    "message": f"{'✓' if satisfied else '✗'} {role_name} crew {crew_id}: {actual_minutes} min (min={min_minutes}, max={max_minutes})"
                })
        
        return results

    def _validate_consecutive(
        self,
        assignments: List[Dict[str, Any]],
        solver_input: Dict[str, Any],
        role_lookup: Dict[int, Dict[str, Any]],
        grid: time_grid.TimeGrid,
    ) -> List[Dict[str, Any]]:
        """Validate consecutive policy - REQUIRED means single contiguous block."""
        results = []
        
        # Get roles with consecutive policy
        roles_with_policy = [
            r for r in solver_input.get("roles", [])
            if r.get("consecutivePolicy") == "REQUIRED"
        ]
        
        if not roles_with_policy:
            return results
        
        # Get eligible crew per role from dailyRequirements
        daily_reqs = solver_input.get("dailyRequirements", [])
        role_crews: Dict[int, set] = defaultdict(set)
        for req in daily_reqs:
            role_crews[req["roleId"]].add(req["crewId"])
        
        for role in roles_with_policy:
            role_id = role["id"]
            role_name = role.get("displayName", str(role_id))
            block_size = max(1, int(role.get("blockSize", 1) or 1))
            
            eligible_crews = role_crews.get(role_id, set())
            for crew_id in eligible_crews:
                # Get assignments for this role+crew, sorted by start time
                role_crew_assigns = sorted(
                    [a for a in assignments if a["roleId"] == role_id and a["crewId"] == crew_id],
                    key=lambda x: x["startMinute"]
                )
                
                if len(role_crew_assigns) <= 1:
                    # 0 or 1 assignments - trivially contiguous
                    results.append({
                        "type": "consecutive",
                        "roleId": role_id,
                        "roleName": role_name,
                        "crewId": crew_id,
                        "policy": "REQUIRED",
                        "blockCount": len(role_crew_assigns),
                        "gaps": [],
                        "satisfied": True,
                        "message": f"✓ {role_name} crew {crew_id}: {len(role_crew_assigns)} blocks, contiguous"
                    })
                    continue
                
                # Check for gaps between consecutive assignments
                gaps = []
                for i in range(len(role_crew_assigns) - 1):
                    current = role_crew_assigns[i]
                    next_assign = role_crew_assigns[i + 1]
                    
                    # Contiguous if current end == next start
                    if current["endMinute"] != next_assign["startMinute"]:
                        gaps.append({
                            "afterMinute": current["endMinute"],
                            "beforeMinute": next_assign["startMinute"],
                            "gapMinutes": next_assign["startMinute"] - current["endMinute"]
                        })
                
                satisfied = len(gaps) == 0
                results.append({
                    "type": "consecutive",
                    "roleId": role_id,
                    "roleName": role_name,
                    "crewId": crew_id,
                    "policy": "REQUIRED",
                    "blockCount": len(role_crew_assigns),
                    "gaps": gaps[:5],  # First 5 gaps
                    "gapCount": len(gaps),
                    "satisfied": satisfied,
                    "message": f"{'✓' if satisfied else '✗'} {role_name} crew {crew_id}: {len(role_crew_assigns)} blocks, {len(gaps)} gaps"
                })
        
        return results

    def _debug_hourly_capacity(
        self,
        solver_input: Dict[str, Any],
        grid: time_grid.TimeGrid,
        variable_bundle: variables.VariableBundle,
    ) -> None:
        """Debug: analyze capacity per hour vs requirements."""
        import sys
        from collections import defaultdict
        
        role_lookup = {r["id"]: r for r in solver_input.get("roles", [])}
        
        # Count unique crew per hour (not variables, but actual crew)
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
        
        # Count hourly requirements 
        hourly_reqs: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for req in solver_input.get("hourlyRequirements", []):
            hour = req["hour"]
            role_id = req["roleId"]
            role_name = role_lookup.get(role_id, {}).get("displayName", f"Role {role_id}")
            hourly_reqs[hour][role_name] = req["required"]
        
        # Count daily requirements by role
        daily_by_role: Dict[int, int] = defaultdict(int)
        for req in solver_input.get("dailyRequirements", []):
            daily_by_role[req["roleId"]] += 1
        
        # Count variables per role per hour
        vars_per_role_hour: Dict[int, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        for var in variable_bundle.slot_variables.values():
            hour = var.start_minute // 60
            vars_per_role_hour[var.role_id][hour] += 1
        
        print("\n=== HOURLY CAPACITY DEBUG ===", file=sys.stderr)
        for hour in sorted(crew_per_hour.keys()):
            crew_count = len(crew_per_hour[hour])
            reqs = hourly_reqs.get(hour, {})
            total_req = sum(reqs.values())
            req_str = ", ".join(f"{name}:{count}" for name, count in reqs.items())
            status = "✓" if total_req <= crew_count else "✗ OVER"
            print(f"Hour {hour}: {crew_count} crew available, {total_req} required [{req_str}] {status}", file=sys.stderr)
        
        print("\n=== DAILY ROLES (Break, etc) ===", file=sys.stderr)
        for role_id, count in daily_by_role.items():
            role_name = role_lookup.get(role_id, {}).get("displayName", f"Role {role_id}")
            hours_with_vars = sum(1 for h, c in vars_per_role_hour[role_id].items() if c > 0)
            total_vars = sum(vars_per_role_hour[role_id].values())
            print(f"{role_name}: {count} crew need it, {total_vars} total variables across {hours_with_vars} hours", file=sys.stderr)
            # Show distribution per hour
            for hour in sorted(vars_per_role_hour[role_id].keys()):
                var_count = vars_per_role_hour[role_id][hour]
                if var_count > 0:
                    print(f"  Hour {hour}: {var_count} variables", file=sys.stderr)
        
        # Debug: Show Break role specifically
        break_role_id = None
        for role in solver_input.get("roles", []):
            if "break" in role.get("displayName", "").lower():
                break_role_id = role["id"]
                print(f"\n=== BREAK ROLE DEBUG (id={break_role_id}) ===", file=sys.stderr)
                print(f"  windowOffsets: {role.get('windowOffsets')}", file=sys.stderr)
                print(f"  minSlots: {role.get('minSlots')}, maxSlots: {role.get('maxSlots')}", file=sys.stderr)
                print(f"  assignmentModels: {role.get('assignmentModels')}", file=sys.stderr)
                print(f"  blockSize: {role.get('blockSize')}", file=sys.stderr)
                break
        
        if break_role_id:
            break_vars_by_hour = vars_per_role_hour.get(break_role_id, {})
            total_break_vars = sum(break_vars_by_hour.values())
            print(f"  Total break variables: {total_break_vars}", file=sys.stderr)
            for hour in sorted(break_vars_by_hour.keys()):
                var_count = break_vars_by_hour[hour]
                if var_count > 0:
                    # Also show how many crew are available at this hour
                    crew_available = len(crew_per_hour.get(hour, set()))
                    print(f"  Hour {hour}: {var_count} break vars ({crew_available} crew available)", file=sys.stderr)
            print("=== END BREAK DEBUG ===\n", file=sys.stderr)
        
        print("=== END DEBUG ===\n", file=sys.stderr)

    @staticmethod
    def _status_label(status_code: int) -> str:
        mapping = {
            cp_model.OPTIMAL: "OPTIMAL",
            cp_model.FEASIBLE: "FEASIBLE",
            cp_model.INFEASIBLE: "INFEASIBLE",
            cp_model.MODEL_INVALID: "MODEL_INVALID",
            cp_model.UNKNOWN: "UNKNOWN",
        }
        return mapping.get(status_code, "UNKNOWN")

