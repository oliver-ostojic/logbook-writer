#!/usr/bin/env python3
"""Command-line entry point for the metadata-driven solver."""
from __future__ import annotations

import json
import sys
from typing import Any, Dict

from .solver_v2 import SolverV2Engine


class SolverCliError(Exception):
    """Raised when the CLI cannot parse input or run the solver."""


def _read_payload() -> Dict[str, Any]:
    try:
        raw = json.load(sys.stdin)
    except Exception as exc:  # pragma: no cover - process guardrail
        raise SolverCliError(f"Failed to parse solver payload: {exc}") from exc

    if not isinstance(raw, dict):
        raise SolverCliError("Solver payload must be a JSON object")
    return raw


def _emit_json(data: Dict[str, Any]) -> None:
    json.dump(data, sys.stdout)


def main() -> int:  # pragma: no cover - thin CLI wrapper
    try:
        payload = _read_payload()
        solver_input = payload.get("solverInput") or payload
        time_limit = payload.get("timeLimitSeconds")

        engine = SolverV2Engine(time_limit_seconds=time_limit)
        result = engine.solve(solver_input)

        output: Dict[str, Any] = {
            "status": result.status,
            "success": result.success,
            "objectiveValue": result.objective_value,
            "assignments": result.assignments,
            "metadata": result.metadata,
        }
        _emit_json(output)
        return 0
    except SolverCliError as exc:
        _emit_json({"success": False, "error": str(exc)})
        return 1
    except Exception as exc:  # pragma: no cover - last-resort safety
        _emit_json({"success": False, "error": str(exc)})
        return 1


if __name__ == "__main__":  # pragma: no cover - module entry
    raise SystemExit(main())

