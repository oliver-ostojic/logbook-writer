"""Objective assembly for Solver V2.

Walks preference descriptors, fairness history, and consecutive policies to build
structured metadata that mirrors the TypeScript builder.  The resulting records
allow us to validate coefficient math before wiring OR-Tools.
"""
from __future__ import annotations

import math
import os
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Iterable, List, Optional, Tuple

from .constraints import ModelEnvelope
from .time_grid import TimeGrid
from .variables import AssignmentVariable, VariableBundle

SLOT_BASED_ASSIGNMENT_MODELS = {"HOURLY", "HOURLY_WINDOW", "SOLVER"}


def _parse_positive_float(value: Optional[str], fallback: float) -> float:
    if value is None:
        return fallback
    try:
        parsed = float(value)
    except ValueError:
        return fallback
    return parsed if math.isfinite(parsed) and parsed > 0 else fallback


FAIRNESS_SURPLUS_PENALTY = _parse_positive_float(os.getenv("FAIRNESS_SURPLUS_PENALTY"), 5.0)
FAIRNESS_MIN_STD_DEV = _parse_positive_float(os.getenv("FAIRNESS_MIN_STD_DEV"), 60.0)
BASE_CONSECUTIVE_GAP_WEIGHT = _parse_positive_float(
    os.getenv("BASE_CONSECUTIVE_GAP_WEIGHT"), 500.0
)


def build_objective(
    model: ModelEnvelope,
    solver_input: Dict[str, Any],
    variable_bundle: VariableBundle,
    grid: TimeGrid,
) -> None:
    preferences: List[Dict[str, Any]] = solver_input.get("preferences", [])
    roles: List[Dict[str, Any]] = solver_input.get("roles", [])
    crew: List[Dict[str, Any]] = solver_input.get("crew", [])
    fairness_history: List[Dict[str, Any]] = solver_input.get("fairnessHistory", [])

    role_lookup = {role["id"]: role for role in roles}
    crew_lookup = {member["id"]: member for member in crew}

    grouped_variables = _group_variables(variable_bundle)

    _build_preference_terms(
        model=model,
        preferences=preferences,
        grouped_variables=grouped_variables,
        crew_lookup=crew_lookup,
        role_lookup=role_lookup,
        grid=grid,
    )

    _build_preference_consecutive_penalties(model, preferences, grouped_variables)
    _build_role_consecutive_penalties(model, roles, grouped_variables)

    _build_fairness_terms(
        model=model,
        fairness_history=fairness_history,
        roles=roles,
        crew=crew,
        grouped_variables=grouped_variables,
    )


def _group_variables(
    variable_bundle: VariableBundle,
) -> Dict[str, List[AssignmentVariable]]:
    grouped: DefaultDict[str, List[AssignmentVariable]] = defaultdict(list)
    for variable in variable_bundle.slot_variables.values():
        key = _crew_role_key(variable.crew_id, variable.role_id)
        grouped[key].append(variable)
    for variables in grouped.values():
        variables.sort(key=lambda var: var.slot_index)
    return dict(grouped)


def _crew_role_key(crew_id: str, role_id: int) -> str:
    return f"{crew_id}:{role_id}"


def _split_crew_role_key(key: str) -> Tuple[str, int]:
    crew_id, role_id_str = key.split(":", 1)
    return crew_id, int(role_id_str)


def _build_preference_terms(
    model: ModelEnvelope,
    preferences: List[Dict[str, Any]],
    grouped_variables: Dict[str, List[AssignmentVariable]],
    crew_lookup: Dict[str, Dict[str, Any]],
    role_lookup: Dict[int, Dict[str, Any]],
    grid: TimeGrid,
) -> None:
    for preference in preferences:
        if not _preference_supports_slot_assignments(preference):
            continue
        role_id = preference.get("roleId")
        if role_id is None:
            continue
        crew_id = preference.get("crewId")
        if crew_id is None:
            continue
        variables = grouped_variables.get(_crew_role_key(crew_id, role_id))
        if not variables:
            continue
        weight = _compute_effective_weight(preference)
        if weight <= 0:
            continue

        preference_type = preference.get("preferenceType")
        if preference_type == "FIRST_HOUR":
            _handle_first_hour_preference(
                model,
                preference,
                weight,
                crew_lookup.get(crew_id),
                role_id,
                grouped_variables,
                grid,
            )
        elif preference_type == "FAVORITE":
            _handle_favorite_preference(model, preference, weight, variables)
        elif preference_type == "TIMING":
            _handle_timing_preference(
                model,
                preference,
                weight,
                variables,
                crew_lookup.get(crew_id),
                role_lookup.get(role_id),
                grid,
            )
        elif preference_type == "CONSECUTIVE":
            # Handled separately via gap penalties.
            continue


def _compute_effective_weight(preference: Dict[str, Any]) -> float:
    base = float(preference.get("baseWeight", 0))
    crew_weight = float(preference.get("crewWeight", 0))
    adaptive = float(preference.get("adaptiveBoost", 1))
    banked = float(preference.get("bankedWeightBoost", 1))
    return base * crew_weight * adaptive * banked


def _preference_supports_slot_assignments(preference: Dict[str, Any]) -> bool:
    models: Iterable[str] = preference.get("assignmentModels", [])
    return any(model in SLOT_BASED_ASSIGNMENT_MODELS for model in models)


def _handle_first_hour_preference(
    model: ModelEnvelope,
    preference: Dict[str, Any],
    weight: float,
    crew_record: Optional[Dict[str, Any]],
    role_id: int,
    grouped_variables: Dict[str, List[AssignmentVariable]],
    grid: TimeGrid,
) -> None:
    if not crew_record:
        return
    crew_id = crew_record["id"]
    first_slot = _minutes_to_slot_index(crew_record["shiftStartMin"], grid, mode="floor")
    variable = _find_variable(grouped_variables, crew_id, role_id, first_slot)
    if not variable:
        return
    _push_preference_term(
        model,
        variable,
        weight,
        preference,
        kind="FIRST_HOUR",
        extra_metadata={"slotIndex": first_slot},
    )


def _handle_favorite_preference(
    model: ModelEnvelope,
    preference: Dict[str, Any],
    weight: float,
    variables: List[AssignmentVariable],
) -> None:
    for variable in variables:
        _push_preference_term(
            model,
            variable,
            weight,
            preference,
            kind="FAVORITE",
            extra_metadata={"slotIndex": variable.slot_index},
        )


def _handle_timing_preference(
    model: ModelEnvelope,
    preference: Dict[str, Any],
    weight: float,
    variables: List[AssignmentVariable],
    crew_record: Optional[Dict[str, Any]],
    role_record: Optional[Dict[str, Any]],
    grid: TimeGrid,
) -> None:
    if crew_record is None or role_record is None:
        return
    int_value = preference.get("intValue")
    if not isinstance(int_value, (int, float)) or int_value == 0:
        return

    shift_start = crew_record["shiftStartMin"]
    shift_end = crew_record["shiftEndMin"]
    if shift_end <= shift_start:
        return
    window_start_min = shift_start + int(role_record.get("windowOffsets", {}).get("startOffsetMin", 0))
    window_end_min = shift_start + int(
        role_record.get("windowOffsets", {}).get("endOffsetMin", shift_end - shift_start)
    )
    start_slot = _minutes_to_slot_index(window_start_min, grid, mode="floor")
    end_slot = _minutes_to_slot_index(window_end_min, grid, mode="ceil")
    if end_slot <= start_slot:
        return

    span = max(1, end_slot - start_slot - 1)
    desire_late = int_value > 0

    for variable in variables:
        slot_index = variable.slot_index
        if slot_index < start_slot or slot_index >= end_slot:
            continue
        offset = max(0, slot_index - start_slot)
        normalized = offset / span if span else 1.0
        score = normalized if desire_late else 1 - normalized
        if score <= 0:
            continue
        _push_preference_term(
            model,
            variable,
            weight * score,
            preference,
            kind="TIMING",
            extra_metadata={
                "slotIndex": slot_index,
                "normalizedPosition": normalized,
                "timingPreference": "LATE" if desire_late else "EARLY",
            },
        )


def _find_variable(
    grouped_variables: Dict[str, List[AssignmentVariable]],
    crew_id: str,
    role_id: int,
    slot_index: int,
) -> Optional[AssignmentVariable]:
    variables = grouped_variables.get(_crew_role_key(crew_id, role_id))
    if not variables:
        return None
    for variable in variables:
        if variable.slot_index == slot_index:
            return variable
    return None


def _push_preference_term(
    model: ModelEnvelope,
    variable: AssignmentVariable,
    coefficient: float,
    preference: Dict[str, Any],
    *,
    kind: str,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> None:
    if coefficient == 0:
        return
    metadata = {
        "kind": kind,
        "crewId": variable.crew_id,
        "roleId": variable.role_id,
        "slotIndex": variable.slot_index,
        "preferenceType": preference.get("preferenceType"),
        "rolePreferenceId": preference.get("rolePreferenceId"),
    }
    if extra_metadata:
        metadata.update(extra_metadata)
    descriptor = {
        "variableKey": variable.key,
        "coefficient": coefficient,
        "metadata": metadata,
    }
    model.add_objective_term("preferences", descriptor)


def _build_preference_consecutive_penalties(
    model: ModelEnvelope,
    preferences: List[Dict[str, Any]],
    grouped_variables: Dict[str, List[AssignmentVariable]],
) -> None:
    for preference in preferences:
        if preference.get("preferenceType") != "CONSECUTIVE":
            continue
        if not _preference_supports_slot_assignments(preference):
            continue
        int_value = preference.get("intValue")
        if not isinstance(int_value, (int, float)) or int_value == 0:
            continue
        role_id = preference.get("roleId")
        crew_id = preference.get("crewId")
        if role_id is None or crew_id is None:
            continue
        variables = grouped_variables.get(_crew_role_key(crew_id, role_id))
        if not variables or len(variables) <= 1:
            continue
        weight = _compute_effective_weight(preference)
        if weight <= 0:
            continue
        signed_weight = weight if int_value > 0 else -weight
        source = "PREFERENCE_CONTIGUOUS" if int_value > 0 else "PREFERENCE_SWITCH"

        for current, nxt in _adjacent_pairs(variables):
            descriptor = {
                "crewId": crew_id,
                "roleId": role_id,
                "slotPair": [current.slot_index, nxt.slot_index],
                "weight": signed_weight,
                "source": source,
                "rolePreferenceId": preference.get("rolePreferenceId"),
                "preferenceType": preference.get("preferenceType"),
                "variableKeys": [current.key, nxt.key],
            }
            model.add_objective_term("consecutive", descriptor)


def _build_role_consecutive_penalties(
    model: ModelEnvelope,
    roles: List[Dict[str, Any]],
    grouped_variables: Dict[str, List[AssignmentVariable]],
) -> None:
    if BASE_CONSECUTIVE_GAP_WEIGHT <= 0:
        return
    role_lookup = {role["id"]: role for role in roles}
    for key, variables in grouped_variables.items():
        if len(variables) <= 1:
            continue
        _, role_id = _split_crew_role_key(key)
        role = role_lookup.get(role_id)
        if not role or role.get("consecutivePolicy") != "PREFERRED":
            continue
        for current, nxt in _adjacent_pairs(variables):
            descriptor = {
                "crewId": current.crew_id,
                "roleId": current.role_id,
                "slotPair": [current.slot_index, nxt.slot_index],
                "weight": BASE_CONSECUTIVE_GAP_WEIGHT,
                "source": "ROLE_POLICY",
                "variableKeys": [current.key, nxt.key],
            }
            model.add_objective_term("consecutive", descriptor)


def _adjacent_pairs(variables: List[AssignmentVariable]) -> Iterable[Tuple[AssignmentVariable, AssignmentVariable]]:
    for index in range(len(variables) - 1):
        current = variables[index]
        nxt = variables[index + 1]
        if nxt.slot_index - current.slot_index == 1:
            yield current, nxt


def _build_fairness_terms(
    model: ModelEnvelope,
    fairness_history: List[Dict[str, Any]],
    roles: List[Dict[str, Any]],
    crew: List[Dict[str, Any]],
    grouped_variables: Dict[str, List[AssignmentVariable]],
) -> None:
    if not fairness_history or FAIRNESS_SURPLUS_PENALTY <= 0:
        return

    role_lookup = {role["id"]: role for role in roles}
    role_eligibility: Dict[int, set[str]] = defaultdict(set)
    for crew_member in crew:
        for role_id in crew_member.get("roleIds", []):
            role_eligibility[role_id].add(crew_member["id"])

    penalties: Dict[str, Dict[str, float]] = {}

    for role in roles:
        if not role.get("fairnessTracking", {}).get("enabled"):
            continue
        eligible = role_eligibility.get(role["id"], set())
        if not eligible:
            continue

        minutes_by_crew = {crew_id: 0 for crew_id in eligible}
        for entry in fairness_history:
            if entry.get("roleId") != role["id"]:
                continue
            crew_id = entry.get("crewId")
            if crew_id not in eligible:
                continue
            minutes_by_crew[crew_id] = minutes_by_crew.get(crew_id, 0) + entry.get("minutesAssigned", 0)

        crew_minutes = list(minutes_by_crew.values())
        if not crew_minutes:
            continue
        average_minutes = sum(crew_minutes) / len(crew_minutes)
        if average_minutes <= 0:
            continue
        variance = (
            sum((value - average_minutes) ** 2 for value in crew_minutes) / len(crew_minutes)
        )
        std_dev = max(math.sqrt(variance), FAIRNESS_MIN_STD_DEV)

        for crew_id, minutes in minutes_by_crew.items():
            z_score = (minutes - average_minutes) / std_dev
            if z_score <= 0:
                continue
            surplus = max(0, minutes - average_minutes)
            coefficient = FAIRNESS_SURPLUS_PENALTY * z_score
            if coefficient <= 0:
                continue
            penalties[_crew_role_key(crew_id, role["id"])] = {
                "coefficient": coefficient,
                "surplus": surplus,
                "average": average_minutes,
                "lookbackDays": role.get("fairnessTracking", {}).get("lookbackDays", 0),
                "zScore": z_score,
            }

    if not penalties:
        return

    for key, variables in grouped_variables.items():
        penalty = penalties.get(key)
        if not penalty:
            continue
        for variable in variables:
            descriptor = {
                "variableKey": variable.key,
                "coefficient": penalty["coefficient"],
                "crewId": variable.crew_id,
                "roleId": variable.role_id,
                "slotIndex": variable.slot_index,
                "surplusMinutes": penalty["surplus"],
                "averageMinutes": penalty["average"],
                "lookbackDays": penalty["lookbackDays"],
                "zScore": penalty["zScore"],
            }
            model.add_objective_term("fairness", descriptor)


def _minutes_to_slot_index(minute: int, grid: TimeGrid, *, mode: str = "floor") -> int:
    relative = minute - grid.day_start_minute
    slot = relative / grid.base_slot_minutes
    if mode == "ceil":
        index = math.ceil(slot)
    else:
        index = math.floor(slot)
    if mode == "ceil":
        upper_bound = len(grid.slots)
    else:
        upper_bound = max(0, len(grid.slots) - 1)
    return max(0, min(index, upper_bound))
