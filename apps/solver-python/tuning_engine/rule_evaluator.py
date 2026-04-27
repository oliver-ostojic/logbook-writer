"""Rule Evaluator: Post-solve satisfaction evaluation for CrewRoleRules.

This module evaluates how well each CrewRoleRule was satisfied by a schedule.
It's used by the tuning engine to build satisfaction vectors for weight adjustment.

Each rule type returns a satisfaction score in [0.0, 1.0]:
  - 1.0 = fully satisfied
  - 0.0 = completely violated
  - 0.5 = partially satisfied (for gradient rules)

Rule Types:
  - Binary: FORBID_ROLE, LIKE/DISLIKE_HOUR, ordering constraints, etc.
  - Gradient: TIMING, MAX_CONSECUTIVE (target), DISTRIBUTION
  - N/A: ALLOW_HALF_BLOCKSIZE (metadata flag, not evaluable)
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class RuleSatisfaction:
    """Result of evaluating a single rule."""
    
    def __init__(
        self,
        rule_id: int,
        crew_id: str,
        rule_type: str,
        satisfaction: float,
        eligible: bool = True,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.rule_id = rule_id
        self.crew_id = crew_id
        self.rule_type = rule_type
        self.satisfaction = satisfaction  # 0.0 to 1.0
        self.eligible = eligible  # False if rule doesn't apply (e.g., crew not assigned role)
        self.details = details or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "ruleId": self.rule_id,
            "crewId": self.crew_id,
            "ruleType": self.rule_type,
            "satisfaction": self.satisfaction,
            "eligible": self.eligible,
            "met": self.satisfaction >= 0.5,
            "details": self.details,
        }


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

def evaluate_all_rules(
    role_rules: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
    crew: List[Dict[str, Any]],
    roles: List[Dict[str, Any]] | None = None,
) -> List[RuleSatisfaction]:
    """Evaluate satisfaction for all role rules against a schedule.
    
    Args:
        role_rules: List of role rules from solver input (flattened CrewRoleRules)
        assignments: List of assignments from solver output
        crew: List of crew with shift info (shiftStartMin, shiftEndMin)
        roles: List of roles with familyId (needed for DISTRIBUTION evaluation)
    
    Returns:
        List of RuleSatisfaction objects, one per rule.
    """
    results: List[RuleSatisfaction] = []
    
    # Build lookup structures
    crew_lookup = {c["id"]: c for c in crew}
    assignments_by_crew = _group_assignments_by_crew(assignments)
    
    # Build role -> family lookup
    role_to_family: Dict[int, int] = {}
    if roles:
        for role in roles:
            role_id = role.get("id")
            family_id = role.get("familyId")
            if role_id is not None and family_id is not None:
                role_to_family[role_id] = family_id
    
    for rule in role_rules:
        rule_type = rule.get("type", "")
        crew_id = rule.get("crewId")
        
        if not crew_id:
            # Store-wide rule - skip for now (evaluate per-crew later)
            continue
        
        crew_info = crew_lookup.get(crew_id)
        if not crew_info:
            continue
        
        crew_assignments = assignments_by_crew.get(crew_id, [])
        
        # Dispatch to type-specific evaluator (pass all rules and role_to_family for context)
        result = _evaluate_rule(rule, crew_id, crew_info, crew_assignments, role_rules, role_to_family)
        results.append(result)
    
    return results


def evaluate_rules_to_vector(
    role_rules: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
    crew: List[Dict[str, Any]],
    roles: List[Dict[str, Any]] | None = None,
) -> List[int]:
    """Evaluate rules and return binary satisfaction vector (0 or 1).
    
    This is the format expected by the tuning engine's difference matrix.
    Satisfaction >= 0.5 → 1, else → 0.
    
    IMPORTANT: Ineligible rules (not applicable) are marked as -1.
    The tuning engine should exclude these from satisfaction calculations.
    """
    results = evaluate_all_rules(role_rules, assignments, crew, roles)

    vector: List[int] = []
    for r in results:
        if not r.eligible:
            vector.append(-1)
            continue

        if r.rule_type == "MAX_CONSECUTIVE_MINUTES":
            # Treat as a true "target" preference in the binary matrix:
            # satisfied iff the longest consecutive run reaches the target max.
            longest_run = int(r.details.get("longestRun") or 0)
            target = int(r.details.get("target") or 0)
            if target <= 0:
                # Invalid target: treat as unsatisfied so it surfaces as always failing.
                vector.append(0)
            else:
                vector.append(1 if longest_run >= target else 0)
            continue

        # Default binary mapping
        vector.append(1 if r.satisfaction >= 0.5 else 0)

    return vector


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

def _evaluate_rule(
    rule: Dict[str, Any],
    crew_id: str,
    crew_info: Dict[str, Any],
    assignments: List[Dict[str, Any]],
    all_rules: List[Dict[str, Any]] | None = None,
    role_to_family: Dict[int, int] | None = None,
) -> RuleSatisfaction:
    """Dispatch to the appropriate evaluator based on rule type."""
    rule_type = rule.get("type", "")
    
    # TIMING needs access to all rules to find ASSIGN_BEFORE/AFTER constraints
    if rule_type == "TIMING":
        return _eval_timing(rule, crew_id, crew_info, assignments, all_rules)
    
    # DISTRIBUTION needs role_to_family mapping for family-level calculations
    if rule_type == "DISTRIBUTION_BETWEEN_ROLE_X":
        return _eval_distribution(rule, crew_id, crew_info, assignments, role_to_family)
    
    evaluators = {
        "FORBID_ROLE": _eval_forbid_role,
        "MIN_CONSECUTIVE_MINUTES": _eval_min_consecutive,
        "MAX_CONSECUTIVE_MINUTES": _eval_max_consecutive,
        "CANNOT_BE_ASSIGNED_BEFORE": _eval_ordering_before,
        "CANNOT_BE_ASSIGNED_AFTER": _eval_ordering_after,
        "LIKE_ROLE_FOR_HOUR_X": _eval_like_hour,
        "DISLIKE_ROLE_FOR_HOUR_X": _eval_dislike_hour,
        "MIN_SHIFT_LENGTH_FOR_ACCESS": _eval_min_shift_length,
        "ASSIGN_BEFORE_SHIFT_MIN_X": _eval_assign_before,
        "ASSIGN_AFTER_SHIFT_MIN_X": _eval_assign_after,
        "MAX_CREW_ON_AT_A_TIME": _eval_max_crew_on,
        "ALLOW_HALF_BLOCKSIZE": _eval_not_applicable,
        "CANNOT_ASSIGN_DURING_STORE_HOUR_X": _eval_cannot_assign_hour,
    }
    
    evaluator = evaluators.get(rule_type, _eval_unknown)
    return evaluator(rule, crew_id, crew_info, assignments)


# ---------------------------------------------------------------------------
# Rule-Specific Evaluators
# ---------------------------------------------------------------------------

def _eval_forbid_role(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """FORBID_ROLE: 1.0 if crew never assigned to role, 0.0 if assigned."""
    role_id = rule.get("roleId")
    
    assigned = any(a.get("roleId") == role_id for a in assignments)
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="FORBID_ROLE",
        satisfaction=0.0 if assigned else 1.0,
        details={"assigned": assigned, "roleId": role_id},
    )


def _eval_min_consecutive(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """MIN_CONSECUTIVE_MINUTES: Ratio of actual vs required consecutive time.
    
    If crew has role assigned, check if they meet the minimum.
    If not assigned at all, rule is not applicable (eligible=False).
    """
    role_id = rule.get("roleId")
    min_minutes = rule.get("valueInt", 0)
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    if not role_assignments:
        # Not assigned to this role - rule doesn't apply
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="MIN_CONSECUTIVE_MINUTES",
            satisfaction=1.0,
            eligible=False,
            details={"reason": "not_assigned"},
        )
    
    # Find all consecutive runs
    runs = _find_consecutive_runs(role_assignments)
    longest_run = max(runs) if runs else 0
    
    if min_minutes <= 0:
        satisfaction = 1.0
    else:
        satisfaction = min(1.0, longest_run / min_minutes)
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="MIN_CONSECUTIVE_MINUTES",
        satisfaction=satisfaction,
        details={"longestRun": longest_run, "required": min_minutes},
    )


def _eval_max_consecutive(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """MAX_CONSECUTIVE_MINUTES: How close did they get to their target?
    
    This is a "target" preference - crew WANTS to reach the max.
    Satisfaction = longest_run / max_minutes (capped at 1.0).
    """
    role_id = rule.get("roleId")
    max_minutes = rule.get("valueInt", 0)
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    if not role_assignments:
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="MAX_CONSECUTIVE_MINUTES",
            satisfaction=0.0,
            eligible=False,
            details={"reason": "not_assigned"},
        )
    
    runs = _find_consecutive_runs(role_assignments)
    longest_run = max(runs) if runs else 0
    
    if max_minutes <= 0:
        satisfaction = 1.0
    else:
        # Reward getting close to max (this is a target, not a limit)
        satisfaction = min(1.0, longest_run / max_minutes)
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="MAX_CONSECUTIVE_MINUTES",
        satisfaction=satisfaction,
        details={"longestRun": longest_run, "target": max_minutes, "roleId": role_id},
    )


def _eval_ordering_before(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """CANNOT_BE_ASSIGNED_BEFORE: roleId cannot appear DIRECTLY before targetRoleId.
    
    This is a DIRECT ADJACENCY constraint:
    - Violation if role ENDS exactly where target STARTS (directly consecutive)
    - OK if role ends before target starts with a gap or other task in between
    
    Returns 1.0 if no violations, 0.0 if any direct adjacency violation found.
    """
    role_id = rule.get("roleId")
    target_role_id = rule.get("targetRoleId")
    
    # Get role assignments with start and end times
    role_tasks = [
        {"start": a.get("startMinute", 0), "end": a.get("startMinute", 0) + a.get("durationMin", 0)}
        for a in assignments if a.get("roleId") == role_id
    ]
    target_tasks = [
        {"start": a.get("startMinute", 0), "end": a.get("startMinute", 0) + a.get("durationMin", 0)}
        for a in assignments if a.get("roleId") == target_role_id
    ]
    
    if not role_tasks or not target_tasks:
        # One of the roles not assigned - no violation possible
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="CANNOT_BE_ASSIGNED_BEFORE",
            satisfaction=1.0,
            eligible=False,
            details={"reason": "missing_role"},
        )
    
    # Check for direct adjacency violations: role.end == target.start
    violations = []
    for r in role_tasks:
        for t in target_tasks:
            if r["end"] == t["start"]:
                violations.append({"role_end": r["end"], "target_start": t["start"]})
    
    violated = len(violations) > 0
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="CANNOT_BE_ASSIGNED_BEFORE",
        satisfaction=0.0 if violated else 1.0,
        details={"violations": violations, "violation_count": len(violations)},
    )


def _eval_ordering_after(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """CANNOT_BE_ASSIGNED_AFTER: roleId cannot appear DIRECTLY after targetRoleId.
    
    This is a DIRECT ADJACENCY constraint:
    - Violation if target ENDS exactly where role STARTS (directly consecutive)
    - OK if target ends before role starts with a gap or other task in between
    
    Returns 1.0 if no violations, 0.0 if any direct adjacency violation found.
    """
    role_id = rule.get("roleId")
    target_role_id = rule.get("targetRoleId")
    
    # Get assignments with start and end times
    role_tasks = [
        {"start": a.get("startMinute", 0), "end": a.get("startMinute", 0) + a.get("durationMin", 0)}
        for a in assignments if a.get("roleId") == role_id
    ]
    target_tasks = [
        {"start": a.get("startMinute", 0), "end": a.get("startMinute", 0) + a.get("durationMin", 0)}
        for a in assignments if a.get("roleId") == target_role_id
    ]
    
    if not role_tasks or not target_tasks:
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="CANNOT_BE_ASSIGNED_AFTER",
            satisfaction=1.0,
            eligible=False,
            details={"reason": "missing_role"},
        )
    
    # Check for direct adjacency violations: target.end == role.start
    violations = []
    for r in role_tasks:
        for t in target_tasks:
            if t["end"] == r["start"]:
                violations.append({"target_end": t["end"], "role_start": r["start"]})
    
    violated = len(violations) > 0
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="CANNOT_BE_ASSIGNED_AFTER",
        satisfaction=0.0 if violated else 1.0,
        details={"violations": violations, "violation_count": len(violations)},
    )


def _eval_timing(
    rule: Dict,
    crew_id: str,
    crew_info: Dict,
    assignments: List[Dict],
    all_rules: List[Dict] | None = None,
) -> RuleSatisfaction:
    """TIMING: Binary check if assignment is in the correct third of valid range.
    
    valueInt: -1=early (first third), 0=middle (middle third), 1=late (last third)
    
    The "valid range" is constrained by any ASSIGN_BEFORE/AFTER rules for this
    crew+role, not just the full shift. This prevents penalizing assignments
    that are placed correctly within their required window.
    
    Returns 1.0 if ANY assignment for this role lands in the correct third.
    """
    role_id = rule.get("roleId")
    timing_pref = rule.get("valueInt", 0)  # -1, 0, or 1
    
    shift_start = crew_info.get("shiftStartMin", 0)
    shift_end = crew_info.get("shiftEndMin", 480)
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    if not role_assignments:
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="TIMING",
            satisfaction=0.0,  # Not assigned = not satisfied
            eligible=False,
            details={"reason": "not_assigned"},
        )
    
    # Determine valid range, respecting ASSIGN_BEFORE/AFTER constraints
    valid_start = shift_start
    valid_end = shift_end
    
    if all_rules:
        for r in all_rules:
            r_crew = r.get("crewId")
            r_role = r.get("roleId")
            r_type = r.get("type", "")
            
            # Only consider rules for this crew+role
            if r_crew != crew_id or r_role != role_id:
                continue
            
            if r_type == "ASSIGN_BEFORE_SHIFT_MIN_X":
                # Must start within first X minutes -> valid_end is capped
                before_min = r.get("valueInt", 0)
                if before_min > 0:
                    valid_end = min(valid_end, shift_start + before_min)
            
            elif r_type == "ASSIGN_AFTER_SHIFT_MIN_X":
                # Must start after X minutes -> valid_start is pushed forward
                after_min = r.get("valueInt", 0)
                if after_min > 0:
                    valid_start = max(valid_start, shift_start + after_min)
    
    valid_length = valid_end - valid_start
    if valid_length <= 0:
        # Conflicting constraints - use full shift
        valid_start = shift_start
        valid_end = shift_end
        valid_length = shift_end - shift_start
    
    # Split valid range into thirds
    third_length = valid_length / 3.0
    early_end = valid_start + third_length
    middle_end = valid_start + (2 * third_length)
    # late is from middle_end to valid_end
    
    # Check if ANY assignment lands in the correct third
    satisfied = False
    assignment_positions = []
    
    for a in role_assignments:
        start = a.get("startMinute", 0)
        
        # Determine which third this assignment is in
        if start < early_end:
            position = "early"
        elif start < middle_end:
            position = "middle"
        else:
            position = "late"
        
        assignment_positions.append(position)
        
        # Check if it matches the preference
        if timing_pref < 0 and position == "early":
            satisfied = True
        elif timing_pref == 0 and position == "middle":
            satisfied = True
        elif timing_pref > 0 and position == "late":
            satisfied = True
    
    pref_name = {-1: "early", 0: "middle", 1: "late"}.get(timing_pref, "unknown")
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="TIMING",
        satisfaction=1.0 if satisfied else 0.0,
        details={
            "timingPref": pref_name,
            "validRange": [valid_start, valid_end],
            "assignmentPositions": assignment_positions,
            "satisfied": satisfied,
        },
    )


def _eval_like_hour(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """LIKE_ROLE_FOR_HOUR_X: 1.0 if assigned in preferred hour, 0.0 otherwise.
    
    valueInt is minutes from shift start (e.g., 0 = first hour, 60 = second hour).
    """
    role_id = rule.get("roleId")
    shift_relative_min = rule.get("valueInt", 0)
    
    shift_start = crew_info.get("shiftStartMin", 0)
    target_hour_start = shift_start + shift_relative_min
    target_hour_end = target_hour_start + 60
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    # Check if any assignment overlaps with the preferred hour
    assigned_in_hour = any(
        a.get("startMinute", 0) < target_hour_end and a.get("endMinute", 0) > target_hour_start
        for a in role_assignments
    )
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="LIKE_ROLE_FOR_HOUR_X",
        satisfaction=1.0 if assigned_in_hour else 0.0,
        details={"shiftRelativeMin": shift_relative_min, "assignedInHour": assigned_in_hour},
    )


def _eval_dislike_hour(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """DISLIKE_ROLE_FOR_HOUR_X: 1.0 if NOT assigned in disliked hour, 0.0 if assigned.
    
    valueInt is minutes from shift start.
    """
    role_id = rule.get("roleId")
    shift_relative_min = rule.get("valueInt", 0)
    
    shift_start = crew_info.get("shiftStartMin", 0)
    target_hour_start = shift_start + shift_relative_min
    target_hour_end = target_hour_start + 60
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    # Check if any assignment overlaps with the disliked hour
    assigned_in_hour = any(
        a.get("startMinute", 0) < target_hour_end and a.get("endMinute", 0) > target_hour_start
        for a in role_assignments
    )
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="DISLIKE_ROLE_FOR_HOUR_X",
        satisfaction=0.0 if assigned_in_hour else 1.0,
        details={"shiftRelativeMin": shift_relative_min, "assignedInHour": assigned_in_hour},
    )


def _eval_min_shift_length(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """MIN_SHIFT_LENGTH_FOR_ACCESS: 1.0 if shift >= required, else check if assigned.
    
    If shift is too short AND crew was assigned the role, that's a violation (0.0).
    If shift is too short but crew wasn't assigned, it's satisfied (rule was respected).
    """
    role_id = rule.get("roleId")
    min_shift = rule.get("valueInt") or 0  # Handle None explicitly
    
    shift_start = crew_info.get("shiftStartMin", 0)
    shift_end = crew_info.get("shiftEndMin", 0)
    shift_length = shift_end - shift_start
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    if shift_length >= min_shift:
        # Shift is long enough - rule is satisfied
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="MIN_SHIFT_LENGTH_FOR_ACCESS",
            satisfaction=1.0,
            details={"shiftLength": shift_length, "required": min_shift},
        )
    
    # Shift is too short - check if they were assigned anyway
    if role_assignments:
        # Violation: assigned despite short shift
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="MIN_SHIFT_LENGTH_FOR_ACCESS",
            satisfaction=0.0,
            details={"shiftLength": shift_length, "required": min_shift, "violation": True},
        )
    
    # Short shift, but correctly not assigned
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="MIN_SHIFT_LENGTH_FOR_ACCESS",
        satisfaction=1.0,
        eligible=False,
        details={"shiftLength": shift_length, "required": min_shift, "reason": "short_shift"},
    )


def _eval_assign_before(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """ASSIGN_BEFORE_SHIFT_MIN_X: Role must start within first X minutes of shift.
    
    1.0 if any assignment starts in window, 0.0 otherwise.
    """
    role_id = rule.get("roleId")
    before_minutes = rule.get("valueInt", 0)
    
    shift_start = crew_info.get("shiftStartMin", 0)
    deadline = shift_start + before_minutes
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    if not role_assignments:
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="ASSIGN_BEFORE_SHIFT_MIN_X",
            satisfaction=1.0,
            eligible=False,
            details={"reason": "not_assigned"},
        )
    
    # Check if any assignment starts within the window
    any_in_window = any(a.get("startMinute", 0) < deadline for a in role_assignments)
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="ASSIGN_BEFORE_SHIFT_MIN_X",
        satisfaction=1.0 if any_in_window else 0.0,
        details={"deadline": deadline, "anyInWindow": any_in_window},
    )


def _eval_assign_after(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """ASSIGN_AFTER_SHIFT_MIN_X: Role must start after X minutes into shift.
    
    1.0 if all assignments start after threshold, 0.0 if any start early.
    """
    role_id = rule.get("roleId")
    after_minutes = rule.get("valueInt") or 0
    
    shift_start = crew_info.get("shiftStartMin", 0)
    earliest_allowed = shift_start + after_minutes
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    if not role_assignments:
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="ASSIGN_AFTER_SHIFT_MIN_X",
            satisfaction=1.0,
            eligible=False,
            details={"reason": "not_assigned"},
        )
    
    # Check if any assignment starts too early
    any_too_early = any(a.get("startMinute", 0) < earliest_allowed for a in role_assignments)
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="ASSIGN_AFTER_SHIFT_MIN_X",
        satisfaction=0.0 if any_too_early else 1.0,
        details={"earliestAllowed": earliest_allowed, "anyTooEarly": any_too_early},
    )


def _eval_max_crew_on(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """MAX_CREW_ON_AT_A_TIME: Store-level constraint, not per-crew.
    
    This is evaluated at store level, not individual crew level.
    Return N/A for individual crew evaluation.
    """
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="MAX_CREW_ON_AT_A_TIME",
        satisfaction=1.0,
        eligible=False,
        details={"reason": "store_level_constraint"},
    )


def _eval_distribution(
    rule: Dict,
    crew_id: str,
    crew_info: Dict,
    assignments: List[Dict],
    role_to_family: Dict[int, int] | None = None,
) -> RuleSatisfaction:
    """DISTRIBUTION_BETWEEN_ROLE_X: Binary check if target FAMILY ratio is in correct zone.
    
    This operates at the FAMILY level, not individual role level.
    roleId and targetRoleId are used to look up their respective families,
    then we sum time across ALL roles in each family.
    
    valueInt: -1=prefer LESS of target family, 0=equal, 1=prefer MORE of target family
    
    We calculate: target_family_minutes / (primary_family_minutes + target_family_minutes)
    This EXCLUDES other families (like BREAK, PARKING) from the calculation.
    
    Zones:
      - Less target: target_ratio < 40%
      - Equal: target_ratio 40-60%
      - More target: target_ratio > 60%
    
    Returns 1.0 if ratio falls in the correct zone, 0.0 otherwise.
    """
    role_id = rule.get("roleId")
    target_role_id = rule.get("targetRoleId")
    preference = rule.get("valueInt", 0)  # -1, 0, or 1
    
    if role_to_family is None:
        role_to_family = {}
    
    # Get family IDs for primary and target roles
    primary_family_id = role_to_family.get(role_id)
    target_family_id = role_to_family.get(target_role_id)
    
    # If no family mapping, fall back to individual role comparison
    if primary_family_id is None or target_family_id is None:
        # Fallback: use individual roles
        primary_minutes = sum(
            a.get("endMinute", 0) - a.get("startMinute", 0)
            for a in assignments if a.get("roleId") == role_id
        )
        target_minutes = sum(
            a.get("endMinute", 0) - a.get("startMinute", 0)
            for a in assignments if a.get("roleId") == target_role_id
        )
        mode = "role"
    else:
        # Family-level: sum all roles in each family
        primary_minutes = sum(
            a.get("endMinute", 0) - a.get("startMinute", 0)
            for a in assignments
            if role_to_family.get(a.get("roleId")) == primary_family_id
        )
        target_minutes = sum(
            a.get("endMinute", 0) - a.get("startMinute", 0)
            for a in assignments
            if role_to_family.get(a.get("roleId")) == target_family_id
        )
        mode = "family"
    
    # Total is ONLY these two families (excludes BREAK, PARKING, etc.)
    total = primary_minutes + target_minutes
    if total == 0:
        return RuleSatisfaction(
            rule_id=rule.get("id", 0),
            crew_id=crew_id,
            rule_type="DISTRIBUTION_BETWEEN_ROLE_X",
            satisfaction=0.0,
            eligible=False,
            details={"reason": "no_assignments_in_families", "mode": mode},
        )
    
    EQUAL_TOLERANCE_MIN = 30
    diff = primary_minutes - target_minutes  # positive = primary has more

    if preference == -1:
        satisfied = primary_minutes > target_minutes
        preferred_desc = "primary > target"
    elif preference == 1:
        satisfied = target_minutes > primary_minutes
        preferred_desc = "target > primary"
    else:
        satisfied = abs(diff) <= EQUAL_TOLERANCE_MIN
        preferred_desc = "equal"

    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="DISTRIBUTION_BETWEEN_ROLE_X",
        satisfaction=1.0 if satisfied else 0.0,
        details={
            "mode": mode,
            "primaryFamilyId": primary_family_id,
            "targetFamilyId": target_family_id,
            "primaryMinutes": primary_minutes,
            "targetMinutes": target_minutes,
            "diff": diff,
            "preference": preference,
            "preferredDesc": preferred_desc,
            "satisfied": satisfied,
        },
    )


def _eval_cannot_assign_hour(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """CANNOT_ASSIGN_DURING_STORE_HOUR_X: Forbid role during specific hour.
    
    valueInt is absolute hour in minutes from midnight (e.g., 480 = 08:00).
    1.0 if not assigned during that hour, 0.0 if assigned.
    """
    role_id = rule.get("roleId")
    hour_minutes = rule.get("valueInt", 0)
    
    hour_start = hour_minutes
    hour_end = hour_minutes + 60
    
    role_assignments = [a for a in assignments if a.get("roleId") == role_id]
    
    # Check if any assignment overlaps with the forbidden hour
    assigned_in_hour = any(
        a.get("startMinute", 0) < hour_end and a.get("endMinute", 0) > hour_start
        for a in role_assignments
    )
    
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type="CANNOT_ASSIGN_DURING_STORE_HOUR_X",
        satisfaction=0.0 if assigned_in_hour else 1.0,
        details={"hourMinutes": hour_minutes, "assignedInHour": assigned_in_hour},
    )


def _eval_not_applicable(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """ALLOW_HALF_BLOCKSIZE: Metadata flag, not evaluable."""
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type=rule.get("type", "UNKNOWN"),
        satisfaction=1.0,
        eligible=False,
        details={"reason": "metadata_flag"},
    )


def _eval_unknown(
    rule: Dict, crew_id: str, crew_info: Dict, assignments: List[Dict]
) -> RuleSatisfaction:
    """Unknown rule type - return neutral."""
    return RuleSatisfaction(
        rule_id=rule.get("id", 0),
        crew_id=crew_id,
        rule_type=rule.get("type", "UNKNOWN"),
        satisfaction=0.5,
        eligible=False,
        details={"reason": "unknown_rule_type"},
    )


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _group_assignments_by_crew(assignments: List[Dict]) -> Dict[str, List[Dict]]:
    """Group assignments by crewId."""
    result: Dict[str, List[Dict]] = defaultdict(list)
    for a in assignments:
        crew_id = a.get("crewId")
        if crew_id:
            result[crew_id].append(a)
    return result


def _find_consecutive_runs(assignments: List[Dict]) -> List[int]:
    """Find lengths of consecutive assignment runs in minutes.
    
    Assumes assignments for a single role.
    Returns list of run lengths.
    """
    if not assignments:
        return []
    
    # Sort by start time
    sorted_assignments = sorted(assignments, key=lambda a: a.get("startMinute", 0))
    
    runs = []
    current_run_start = None
    current_run_end = None
    
    for a in sorted_assignments:
        start = a.get("startMinute", 0)
        end = a.get("endMinute", 0)
        
        if current_run_start is None:
            # Start new run
            current_run_start = start
            current_run_end = end
        elif start <= current_run_end:
            # Extend current run (adjacent or overlapping)
            current_run_end = max(current_run_end, end)
        else:
            # Gap - save current run and start new one
            runs.append(current_run_end - current_run_start)
            current_run_start = start
            current_run_end = end
    
    # Don't forget the last run
    if current_run_start is not None:
        runs.append(current_run_end - current_run_start)
    
    return runs


__all__ = [
    "RuleSatisfaction",
    "evaluate_all_rules",
    "evaluate_rules_to_vector",
]
