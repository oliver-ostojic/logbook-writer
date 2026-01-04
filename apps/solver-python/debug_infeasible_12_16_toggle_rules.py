"""Targeted feasibility toggles for debugging the 2025-12-16 INFEASIBLE instance.

This script runs the solver-python SolverV2 against the 12/16 payload while
selectively removing specific RoleRule types for specific roles.

Why:
- The 12/16 payload is INFEASIBLE in solver-python.
- We already observed removing MAX_CONSECUTIVE_MINUTES makes it feasible.
- This script helps isolate interactions (e.g., MIN_CONSECUTIVE vs MAX_CONSECUTIVE).

Usage (from repo root):
  python3 apps/solver-python/debug_infeasible_12_16_toggle_rules.py

Outputs:
- A small table of solver status for each toggle configuration.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple


PAYLOAD_PATH = "../api/solver_input_768_2025-12-16.json"


@dataclass(frozen=True)
class RuleFilter:
    rule_types: Set[str]
    role_codes: Optional[Set[str]] = None  # if None -> all roles

    def matches(self, rule: Dict[str, Any], role_id_to_code: Dict[int, str]) -> bool:
        if rule.get("type") not in self.rule_types:
            return False
        if self.role_codes is None:
            return True
        role_id = rule.get("roleId")
        if role_id is None:
            return False
        return role_id_to_code.get(int(role_id), "") in self.role_codes


def _load_payload(path: str) -> Dict[str, Any]:
    obj = json.load(open(path))
    # API endpoint wraps solver input under { success, data, metadata }
    return obj.get("data", obj)


def _filter_rules(payload: Dict[str, Any], filters: Iterable[RuleFilter]) -> Dict[str, Any]:
    out = copy.deepcopy(payload)
    roles = out.get("roles", [])
    role_id_to_code = {int(r["id"]): r.get("code", "") for r in roles if "id" in r}

    rules = out.get("roleRules", [])
    keep = []
    removed = 0
    for rule in rules:
        if any(f.matches(rule, role_id_to_code) for f in filters):
            removed += 1
            continue
        keep.append(rule)

    out["roleRules"] = keep
    return out, removed


def _run(payload: Dict[str, Any], time_limit_s: int = 15) -> Dict[str, Any]:
    # local import so this script can run from repo root easily
    from logbook_solver_v2.solver_v2 import SolverV2

    solver = SolverV2(payload)
    return solver.solve(time_limit_seconds=time_limit_s, num_workers=1)


def _status(payload: Dict[str, Any], time_limit_s: int = 15) -> str:
    res = _run(payload, time_limit_s=time_limit_s)
    return str(res.get("metadata", {}).get("status"))


def _drop_max_consec_reg_for_crew(payload: Dict[str, Any], crew_ids: Set[str]) -> Tuple[Dict[str, Any], int]:
    """Remove HARD MAX_CONSECUTIVE_MINUTES rules for REG scoped to specific crewIds."""
    out = copy.deepcopy(payload)
    roles = out.get("roles", [])
    role_id_to_code = {int(r["id"]): r.get("code", "") for r in roles if "id" in r}

    rules = out.get("roleRules", [])
    keep: List[Dict[str, Any]] = []
    removed = 0
    for rule in rules:
        if (
            rule.get("constraintType") == "HARD"
            and rule.get("type") == "MAX_CONSECUTIVE_MINUTES"
            and rule.get("crewId") in crew_ids
            and role_id_to_code.get(int(rule.get("roleId") or 0), "") == "REG"
        ):
            removed += 1
            continue
        keep.append(rule)
    out["roleRules"] = keep
    return out, removed


def _bisect_min_feasible_set(
    base: Dict[str, Any],
    crew_ids: Sequence[str],
    time_limit_s: int = 15,
) -> List[str]:
    """Return a (locally) minimal set of crewIds whose rule-removal makes instance FEASIBLE.

    We assume:
    - baseline is INFEASIBLE
    - removing for ALL crewIds is FEASIBLE

    Approach:
    - Start with all crew in the removal-set (known feasible)
    - Greedily attempt to remove halves (delta-debugging style)
    """
    current = list(crew_ids)

    # Sanity
    st0 = _status(base, time_limit_s=time_limit_s)
    if st0 != "INFEASIBLE":
        print(f"[warn] baseline status is {st0}, expected INFEASIBLE")

    all_payload, _ = _drop_max_consec_reg_for_crew(base, set(current))
    st_all = _status(all_payload, time_limit_s=time_limit_s)
    if st_all not in ("FEASIBLE", "OPTIMAL"):
        print(f"[warn] removing for all crew did not fix: status={st_all}")
        return current

    # Delta debugging-ish reduction
    changed = True
    while changed and len(current) > 1:
        changed = False
        n = len(current)
        # try chunk sizes from large to small
        chunk = max(1, n // 2)
        while chunk >= 1:
            i = 0
            reduced_this_round = False
            while i < len(current):
                trial = current[:i] + current[i + chunk :]
                trial_payload, _ = _drop_max_consec_reg_for_crew(base, set(trial))
                st = _status(trial_payload, time_limit_s=time_limit_s)
                if st in ("FEASIBLE", "OPTIMAL"):
                    current = trial
                    changed = True
                    reduced_this_round = True
                    # restart with large chunks
                    break
                i += chunk
            if reduced_this_round:
                break
            chunk //= 2

    return current


def main() -> None:
    base = _load_payload(PAYLOAD_PATH)

    experiments: List[Tuple[str, List[RuleFilter]]] = [
        ("baseline", []),
        ("drop MAX_CONSEC (all roles)", [RuleFilter({"MAX_CONSECUTIVE_MINUTES"})]),
        ("drop MIN_CONSEC (all roles)", [RuleFilter({"MIN_CONSECUTIVE_MINUTES"})]),
        ("drop MIN+MAX (all roles)", [RuleFilter({"MIN_CONSECUTIVE_MINUTES", "MAX_CONSECUTIVE_MINUTES"})]),
        ("drop MIN_CONSEC (REG only)", [RuleFilter({"MIN_CONSECUTIVE_MINUTES"}, role_codes={"REG"})]),
        ("drop MAX_CONSEC (REG only)", [RuleFilter({"MAX_CONSECUTIVE_MINUTES"}, role_codes={"REG"})]),
        ("drop MIN+MAX (REG only)", [RuleFilter({"MIN_CONSECUTIVE_MINUTES", "MAX_CONSECUTIVE_MINUTES"}, role_codes={"REG"})]),
    ]

    print("\n12/16 infeasibility toggle matrix")
    print("- payload:", PAYLOAD_PATH)
    print("- time limit: 15s (single worker)\n")

    for name, flt in experiments:
        payload, removed = _filter_rules(base, flt)
        try:
            res = _run(payload)
            status = res.get("metadata", {}).get("status")
            num = res.get("metadata", {}).get("numAssignments")
            print(f"{name:28} | removed_rules={removed:4d} | status={status:10} | assignments={num}")
        except Exception as e:
            print(f"{name:28} | removed_rules={removed:4d} | ERROR: {e}")

    # ---- Step 1: isolate minimal crew set ----
    crew = base.get("crew", [])
    crew_ids = [str(c.get("id")) for c in crew if c.get("id")]
    crew_name_by_id = {str(c.get("id")): str(c.get("name") or c.get("displayName") or c.get("id")) for c in crew if c.get("id")}

    print("\nMinimal crew set search (drop HARD MAX_CONSECUTIVE_MINUTES for REG only)")
    print("This may take a bit (multiple solver runs).\n")

    minimal = _bisect_min_feasible_set(base, crew_ids, time_limit_s=15)
    print(f"Minimal set size: {len(minimal)} / {len(crew_ids)}")
    for cid in minimal:
        print(f"- {cid}: {crew_name_by_id.get(cid, cid)}")

    # Show how many rules we removed for that set
    payload_min, removed_min = _drop_max_consec_reg_for_crew(base, set(minimal))
    st_min = _status(payload_min, time_limit_s=15)
    print(f"\nVerification: removed_rules={removed_min}, status={st_min}")


if __name__ == "__main__":
    main()
