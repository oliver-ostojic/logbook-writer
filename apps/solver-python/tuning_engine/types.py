"""Shared types and utilities for the tuning engine."""

from __future__ import annotations

from typing import Any, Dict, List, TypedDict


class CrewRoleRuleRecord(TypedDict, total=False):
    """Minimal shape expected for a CrewRoleRule in the tuning engine."""
    id: int
    crewId: str
    roleId: int
    roleCode: str  # e.g., REG, P_HELM, PROD
    type: str  # RoleRuleType string (e.g., TIMING, CANNOT_BE_ASSIGNED_AFTER)
    targetRoleId: int | None
    targetRoleCode: str | None  # e.g., P_HELM when type is CANNOT_BE_ASSIGNED_AFTER
    valueInt: int | None  # e.g., -1 (early), 0 (neutral), 1 (late) for TIMING
    constraintType: str  # HARD | SOFT
    isPriority: bool


class TuningState(TypedDict, total=False):
    """State carried across iterations of the tuning loop."""
    iteration: int
    weights: Dict[int, float]  # rule_id -> weight
    velocities: Dict[int, float]  # rule_id -> velocity (for momentum-based tuning)
    satisfaction_history: List[List[int]]  # list of satisfaction vectors per iteration
    locked_rules: List[int]  # rule IDs marked as unsatisfiable
    converged: bool
