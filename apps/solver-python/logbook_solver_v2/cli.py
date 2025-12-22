#!/usr/bin/env python3
"""Command-line entry point for the refactored metadata-driven solver."""
from __future__ import annotations

import json
import sys
from typing import Any, Dict

from .solver_v2 import SolverV2


class SolverCliError(Exception):
    """Raised when the CLI cannot parse input or run the solver."""


def _read_payload() -> Dict[str, Any]:
    try:
        raw = json.load(sys.stdin)
    except Exception as exc:
        raise SolverCliError(f"Failed to parse solver payload: {exc}") from exc

    if not isinstance(raw, dict):
        raise SolverCliError("Solver payload must be a JSON object")
    return raw


def _emit_json(data: Dict[str, Any]) -> None:
    json.dump(data, sys.stdout)


def main() -> int:
    try:
        payload = _read_payload()
        solver_input = payload.get("solverInput") or payload
        time_limit = payload.get("timeLimitSeconds")
        diagnose_infeasibility = payload.get("diagnoseInfeasibility", False)

        # First try with normal HARD constraints
        solver = SolverV2(solver_input, force_soft_mode=False)
        result = solver.solve(time_limit_seconds=time_limit)

        # If infeasible and diagnose flag is set, re-run with force_soft_mode
        if not result.get("success") and diagnose_infeasibility:
            print("⚠️ INFEASIBLE - Re-running with force_soft_mode for diagnosis...", file=sys.stderr)
            solver_soft = SolverV2(solver_input, force_soft_mode=True)
            result = solver_soft.solve(time_limit_seconds=time_limit)
            result["metadata"]["diagnosisMode"] = True

        # The result from SolverV2.solve() is already a dict with:
        # status, success, objectiveValue, assignments, metadata
        _emit_json(result)
        return 0
    except SolverCliError as exc:
        _emit_json({"success": False, "error": str(exc)})
        return 1
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        _emit_json({"success": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
