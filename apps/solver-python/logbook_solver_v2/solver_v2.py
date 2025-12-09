"""Metadata-driven solver implementation (Phase 2 scaffolding)."""

from __future__ import annotations

from collections import defaultdict
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

    def __init__(self, payload: Dict[str, Any]):
        self.payload = normalize_payload(payload)
        self.model = cp_model.CpModel()

        self.store = self.payload['store']
        self.roles = self.payload['roles']
        self.crew = self.payload['crew']
        
        # NEW schema fields
        self.role_families = self.payload.get('roleFamilies', [])
        self.coverage_windows = self.payload.get('coverageWindows', [])
        self.crew_quotas = self.payload.get('crewQuotas', [])
        
        # DEPRECATED - kept for backward compatibility during transition
        self.hourly_requirements = self.payload.get('hourlyRequirements', [])
        self.window_requirements = self.payload.get('windowRequirements', [])
        self.daily_requirements = self.payload.get('dailyRequirements', [])
        
        self.preferences = self.payload.get('preferences', [])
        
        # Solver settings (tunable parameters)
        self.settings = self.payload.get('settings', {})

        # Extract task lengths from roles for grid resolution
        task_lengths = [role.get('taskLength', 30) for role in self.roles if role.get('taskLength')]
        
        self.time_grid = TimeGrid.from_store(
            open_minutes=self.store.get('openMinutesFromMidnight', 0),
            close_minutes=self.store.get('closeMinutesFromMidnight', 24 * 60),
            task_lengths=task_lengths,
        )

        builder = VariableBuilder(self.model, self.time_grid)
        self.assignment_vars = builder.build(crew_records=self.crew, role_records=self.roles)
        self.assignment_index = AssignmentIndex(self.assignment_vars)
        self.role_code_by_id = {role['id']: role['code'] for role in self.roles}
        self.role_by_id = {role['id']: role for role in self.roles}
        self.preference_map = self._build_preference_lookup()

        constraints.add_all(self)
        objective.apply(self)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def solve(self, time_limit_seconds: int | None = None) -> Dict[str, Any]:
        solver = cp_model.CpSolver()
        if time_limit_seconds:
            solver.parameters.max_time_in_seconds = time_limit_seconds

        status = solver.Solve(self.model)
        success = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        assignments = []

        if success:
            slot_minutes = self.time_grid.slot_minutes
            for (crew_id, slot, role_id, task_slots), var in self.assignment_vars.items():
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

        if not success:
            result['metadata']['violations'] = []

        return result

    def preference_weight(self, key: AssignmentKey) -> float:
        crew_id, _slot, role_id, _task_slots = key
        return self.preference_map.get((crew_id, role_id), 0.0)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
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


def solve(payload: Dict[str, Any], *, time_limit_seconds: int | None = None) -> Dict[str, Any]:
    solver = SolverV2(payload)
    return solver.solve(time_limit_seconds=time_limit_seconds)


__all__ = ["SolverV2", "solve"]
