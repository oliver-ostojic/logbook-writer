"""Metadata-driven solver implementation (Phase 2 scaffolding)."""

from __future__ import annotations

from collections import defaultdict
import os
from typing import Any, Dict, Iterable, List, Tuple

from ortools.sat.python import cp_model

from .time_grid import TimeGrid
from .variables import AssignmentKey, VariableBuilder
from .normalizer import normalize_payload
from . import constraints, objective


class AssignmentIndex:
    """Lightweight lookup tables for assignment variables."""

    def __init__(self, variables: Dict[AssignmentKey, cp_model.IntVar]):
        # Key is now (crew_id, slot, role_id, task_slots)
        self.by_crew_slot: Dict[Tuple[str, int], List[Tuple[int, int, cp_model.IntVar]]] = defaultdict(list)
        self.by_slot: Dict[int, List[Tuple[int, int, cp_model.IntVar]]] = defaultdict(list)

        for (crew_id, slot, role_id, task_slots), var in variables.items():
            self.by_crew_slot[(crew_id, slot)].append((role_id, task_slots, var))
            self.by_slot[slot].append((role_id, task_slots, var))

    def get(self, key: Tuple[str, int]) -> List[Tuple[int, int, cp_model.IntVar]]:
        return self.by_crew_slot.get(key, [])

    def get_by_slot(self, slot: int) -> List[Tuple[int, int, cp_model.IntVar]]:
        return self.by_slot.get(slot, [])


class SolverV2:
    """CP-SAT model that consumes the metadata-driven SolverInputV2 payload."""

    def __init__(self, payload: Dict[str, Any], force_soft_mode: bool = False, weights: Dict[int, float] | None = None):
        """
        Initialize the solver.
        
        Args:
            payload: The solver input payload
            force_soft_mode: If True, treat all HARD constraints as SOFT for 
                            feasibility diagnosis. This is for testing only!
            weights: Optional tuning weights for CrewRoleRules (rule_id -> weight)
        """
        self.payload = normalize_payload(payload)
        self.model = cp_model.CpModel()
        self.force_soft_mode = force_soft_mode
        
        # Track softened constraints for reporting
        self.softened_constraint_violations: List[Dict[str, Any]] = []

        self.store = self.payload['store']
        self.roles = self.payload['roles']
        self.crew = self.payload['crew']
        
        # Tuning weights for CrewRoleRules (rule_id -> weight, default 1.0)
        self.rule_weights: Dict[int, float] = weights or {}
        
        # NEW schema fields
        self.role_families = self.payload.get('roleFamilies', [])
        self.coverage_windows = self.payload.get('coverageWindows', [])
        self.crew_quotas = self.payload.get('crewQuotas', [])
        self.role_rules = self.payload.get('roleRules', [])
        
        # Soft constraint penalties - populated by constraint builders, used by objective
        self.soft_constraint_penalties: List = []
        
        # Raw penalty info for quadratic mode: list of {'weight': int, 'var': IntVar, 'max_value': int}
        self.raw_penalty_info: List[Dict] = []
        
        # Fairness rotation terms - populated by fairness constraint, used by objective
        self.fairness_rotation_terms: List = []
        
        # Quota shortfall vars - populated by quota constraints, used by objective and result reporting
        self.quota_shortfall_vars: List = []
        
        # DEPRECATED - kept for backward compatibility during transition
        self.hourly_requirements = self.payload.get('hourlyRequirements', [])
        self.window_requirements = self.payload.get('windowRequirements', [])
        self.crew_quotas = self.payload.get('crewQuotas', [])
        
        self.preferences = self.payload.get('preferences', [])
        
        # Solver settings (tunable parameters)
        self.settings = self.payload.get('settings', {})

        # Preprocess role rules to apply ALLOW_HALF_BLOCKSIZE to role records
        # This must happen BEFORE variable building
        self._apply_allow_half_blocksize_to_roles()

        # Extract task lengths from roles for grid resolution
        task_lengths = [role.get('taskLength', 30) for role in self.roles if role.get('taskLength')]
        
        self.time_grid = TimeGrid.from_store(
            open_minutes=self.store.get('openMinutesFromMidnight', 0),
            close_minutes=self.store.get('closeMinutesFromMidnight', 24 * 60),
            task_lengths=task_lengths,
        )

        builder = VariableBuilder(self.model, self.time_grid)
        self.assignment_vars = builder.build(
            crew_records=self.crew,
            role_records=self.roles,
            crew_quotas=self.crew_quotas,
        )
        self.assignment_index = AssignmentIndex(self.assignment_vars)
        # Keep lookups deterministic (roles list order may not be stable across payloads)
        roles_sorted = sorted(self.roles, key=lambda r: int(r.get('id', 0)))
        self.role_code_by_id = {role['id']: role['code'] for role in roles_sorted}
        self.role_by_id = {role['id']: role for role in roles_sorted}
        self.preference_map = self._build_preference_lookup()

        constraints.add_all(self)
        objective.apply(self)

    # ------------------------------------------------------------------
    # Constraint helpers
    # ------------------------------------------------------------------
    def is_hard_constraint(self, rule: Dict[str, Any]) -> bool:
        """Check if a rule should be enforced as HARD.
        
        In force_soft_mode, all HARD constraints are treated as SOFT for diagnosis.
        """
        if self.force_soft_mode:
            return False
        return rule.get('constraintType') == 'HARD'
    
    def register_soft_violation(self, rule: Dict[str, Any], violation_var: Any, description: str) -> None:
        """Register a potential softened constraint violation for reporting."""
        if self.force_soft_mode and rule.get('constraintType') == 'HARD':
            self.softened_constraint_violations.append({
                'rule': rule,
                'violationVar': violation_var,
                'description': description,
                'originalConstraintType': 'HARD',
            })

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def solve(
        self,
        time_limit_seconds: int | None = None,
        random_seed: int | None = None,
        num_workers: int | None = None,
    ) -> Dict[str, Any]:
        solver = cp_model.CpSolver()
        if time_limit_seconds:
            solver.parameters.max_time_in_seconds = time_limit_seconds

        # Worker configuration
        # - If num_workers is not provided, default to portfolio search across all CPU cores.
        # - If random_seed is provided AND caller does not override num_workers,
        #   we still default to portfolio (because you're optimizing for speed).
        if num_workers is None or num_workers <= 0:
            num_workers = os.cpu_count() or 1

        # OR-Tools parameter naming varies by version.
        # In this repo's OR-Tools build, setting `num_workers` can yield MODEL_INVALID,
        # while `num_search_workers` works as expected.
        solver.parameters.num_search_workers = int(num_workers)
        
        # Enable Large Neighborhood Search (LNS) for better optimization
        # LNS iteratively destroys and repairs parts of the solution to escape local optima
        solver.parameters.use_lns = True

        # NOTE: In some OR-Tools builds, setting random_seed alongside
        # num_search_workers>1 can lead to MODEL_INVALID. To keep portfolio search
        # usable, only apply random_seed in single-worker mode.
        if random_seed is not None and int(num_workers) == 1:
            solver.parameters.random_seed = random_seed
            solver.parameters.interleave_search = True
            solver.parameters.log_search_progress = False

        status = solver.Solve(self.model)
        success = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        assignments = []

        if success:
            slot_minutes = self.time_grid.slot_minutes
            for (crew_id, slot, role_id, task_slots), var in sorted(
                self.assignment_vars.items(),
                key=lambda kv: (str(kv[0][0]), kv[0][1], kv[0][2], kv[0][3]),
            ):
                if solver.Value(var):
                    start_min = slot * slot_minutes
                    end_min = start_min + (task_slots * slot_minutes)
                    assignments.append(
                        {
                            'crewId': crew_id,
                            'roleId': role_id,
                            'taskType': self.role_code_by_id.get(role_id),
                            'slotIndex': slot,
                            'startMinute': start_min,
                            'endMinute': end_min,
                            # Keep these for backward compatibility
                            'startTime': start_min,
                            'endTime': end_min,
                            'durationMin': task_slots * slot_minutes,
                        }
                    )

        result = {
            'success': success,
            'metadata': {
                'status': self._status(status),
                'runtimeMs': int(solver.WallTime() * 1000),
                'objectiveScore': solver.ObjectiveValue() if success else None,
                'numCrew': len(self.crew),
                'numSlots': self.time_grid.num_slots,
                'slotMinutes': self.time_grid.slot_minutes,
                'numAssignments': len(assignments),
            },
            'assignments': assignments,
        }

        # Report quota shortfalls (quotas that couldn't be fully satisfied)
        if success and hasattr(self, 'quota_trackers') and self.quota_trackers:
            quota_warnings = []
            for tracker in self.quota_trackers:
                shortfall = solver.Value(tracker['shortfallVar'])
                if shortfall > 0:
                    required_min = tracker['requiredMin']
                    actual_min = required_min - shortfall
                    required_hours = required_min / 60
                    actual_hours = actual_min / 60
                    quota_warnings.append({
                        'crewId': tracker['crewId'],
                        'crewName': tracker['crewName'],
                        'roleId': tracker['roleId'],
                        'roleCode': tracker['roleCode'],
                        'requiredMinutes': required_min,
                        'actualMinutes': actual_min,
                        'shortfallMinutes': shortfall,
                        'message': f"{tracker['crewName']} could only get {actual_hours:.1f}h of {tracker['roleCode']} (needed {required_hours:.1f}h)"
                    })
            if quota_warnings:
                result['metadata']['quotaWarnings'] = quota_warnings

        if not success:
            result['metadata']['violations'] = []
            # Include quota divisibility violations if any
            if hasattr(self, 'quota_violations') and self.quota_violations:
                result['metadata']['quotaDivisibilityErrors'] = self.quota_violations

        # Report softened constraint violations (only in force_soft_mode)
        if success and self.force_soft_mode and self.softened_constraint_violations:
            softened_violations = []
            for entry in self.softened_constraint_violations:
                violation_var = entry['violationVar']
                try:
                    # Try to get the value - handle different var types
                    if violation_var is None:
                        violation_value = 0
                    elif hasattr(violation_var, 'Index'):
                        # It's a proper CP-SAT variable
                        violation_value = solver.Value(violation_var)
                    else:
                        # It might be a constant or literal
                        violation_value = int(violation_var) if violation_var else 0
                except Exception:
                    violation_value = 1  # Assume violated if we can't read it
                
                if violation_value > 0:
                    rule = entry['rule']
                    softened_violations.append({
                        'ruleType': rule.get('type'),
                        'roleId': rule.get('roleId'),
                        'crewId': rule.get('crewId'),
                        'valueInt': rule.get('valueInt'),
                        'violationAmount': violation_value,
                        'description': entry['description'],
                        'message': f"⚠️ HARD constraint was softened: {entry['description']} (violated by {violation_value})"
                    })
            if softened_violations:
                result['metadata']['softenedConstraintViolations'] = softened_violations
                result['metadata']['forceSoftModeEnabled'] = True

        return result

    def preference_weight(self, key: AssignmentKey) -> float:
        crew_id, _slot, role_id, _task_slots = key
        return self.preference_map.get((crew_id, role_id), 0.0)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _apply_allow_half_blocksize_to_roles(self) -> None:
        """Preprocess ALLOW_HALF_BLOCKSIZE role rules to set canSplitForGaps on roles.
        
        This must be called BEFORE variable building so that the VariableBuilder
        knows which roles can have half-size task variables.
        """
        # Find all role IDs with ALLOW_HALF_BLOCKSIZE rules
        half_block_role_ids = set()
        for rule in self.role_rules:
            if rule.get('type') == 'ALLOW_HALF_BLOCKSIZE':
                half_block_role_ids.add(rule['roleId'])
        
        # Set canSplitForGaps=True on matching roles
        for role in self.roles:
            if role['id'] in half_block_role_ids:
                role['canSplitForGaps'] = True
    
    def _build_preference_lookup(self) -> Dict[Tuple[str, int], float]:
        weights: Dict[Tuple[str, int], float] = defaultdict(float)
        for pref in self.preferences:
            crew_id = pref.get('crewId')
            role_id = pref.get('roleId')
            if not crew_id or role_id is None:
                continue
            base_weight = float(pref.get('baseWeight', 0))
            crew_weight = float(pref.get('crewWeight', 0))
            adaptive = float(pref.get('adaptiveBoost', 1.0) or 1.0)
            weights[(crew_id, role_id)] += base_weight * crew_weight * adaptive
        return weights

    @staticmethod
    def _status(status_code: int) -> str:
        mapping = {
            cp_model.OPTIMAL: 'OPTIMAL',
            cp_model.FEASIBLE: 'FEASIBLE',
            cp_model.INFEASIBLE: 'INFEASIBLE',
            cp_model.MODEL_INVALID: 'ERROR',
            cp_model.UNKNOWN: 'TIME_LIMIT',
        }
        return mapping.get(status_code, 'ERROR')
    
    def get_rule_weight(self, rule_id: int) -> float:
        """Get the tuning weight for a rule (default 1.0)."""
        return self.rule_weights.get(rule_id, 1.0)

    def apply_solution_hint(self, assignments: List[Dict[str, Any]]) -> None:
        """Apply a previous solution as a hint (warm start) to the solver."""
        # Map assignments to variables
        # assignments format: [{'crewId': '...', 'roleId': '...', 'startMinutes': 123, 'endMinutes': 456}, ...]
        
        # Pre-process assignments into a set of (crew_id, role_id, start_minute)
        hint_set = set()
        for a in assignments:
            # Handle both startMinute and startMinutes (legacy) just in case
            start_min = a.get('startMinute')
            if start_min is None:
                start_min = a.get('startMinutes')
            
            if start_min is not None:
                hint_set.add((str(a['crewId']), int(a['roleId']), int(start_min)))
            
        # Iterate over all variables and set hints
        for (c_id, s_idx, r_id, _), var in self.assignment_vars.items():
            # Calculate start minute for this slot
            start_min, _ = self.time_grid.slot_to_minutes(s_idx)
            
            if (str(c_id), int(r_id), start_min) in hint_set:
                self.model.AddHint(var, 1)
            else:
                self.model.AddHint(var, 0)


def solve(
    payload: Dict[str, Any],
    *,
    time_limit_seconds: int | None = None,
    weights: Dict[int, float] | None = None,
    random_seed: int | None = None,
    num_workers: int | None = None,
    solution_hint: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    """Solve the scheduling problem.
    
    Args:
        payload: Solver input payload
        time_limit_seconds: Optional time limit
        weights: Optional dict mapping rule_id -> weight for tuning (default 1.0)
        random_seed: Optional random seed for deterministic results
        num_workers: Optional number of workers for portfolio search
        solution_hint: Optional list of assignments to use as a warm start
    
    Returns:
        Solver result with assignments
    """
    solver = SolverV2(payload, weights=weights)
    if solution_hint:
        solver.apply_solution_hint(solution_hint)
        
    return solver.solve(
        time_limit_seconds=time_limit_seconds,
        random_seed=random_seed,
        num_workers=num_workers,
    )


__all__ = ["SolverV2", "solve"]
