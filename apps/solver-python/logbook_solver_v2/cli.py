#!/usr/bin/env python3
"""Command-line entry point for the refactored metadata-driven solver."""
from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict

from .solver_v2 import SolverV2

# Training data collection - can be disabled via environment variable
RECORD_TRAINING_DATA = os.environ.get("RECORD_TRAINING_DATA", "1") == "1"
TRAINING_DATA_FILE = os.environ.get("TRAINING_DATA_FILE", "solver_training_data.jsonl")


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


def _record_training_data(payload: Dict[str, Any], result: Dict[str, Any]) -> None:
    """Record successful solve to training data file for ML."""
    if not RECORD_TRAINING_DATA:
        return
    
    if not result.get("success"):
        return
    
    try:
        # Import here to avoid circular imports and allow graceful failure
        from tuning_engine.data_recorder import DataRecorder
        
        recorder = DataRecorder(output_file=TRAINING_DATA_FILE)
        
        # Extract data from result
        metadata = result.get("metadata", {})
        assignments = result.get("assignments", [])
        
        # Get satisfaction stats from metadata
        satisfaction_stats = metadata.get("satisfaction", {})
        eligible = satisfaction_stats.get("eligible", 0)
        satisfied = satisfaction_stats.get("satisfied", 0)
        
        # Get fairness index if available
        fairness_index = metadata.get("fairnessIndex", 0.0)
        
        # Get date from payload
        date = payload.get("date", "unknown")
        
        # Weights - use empty dict since this is a standard solve (not tuned)
        weights = {}
        
        recorder.record(
            payload=payload,
            weights=weights,
            satisfaction=satisfied,
            eligible=eligible,
            fairness_index=fairness_index,
            date=date,
            metadata={"assignments": assignments, **metadata}
        )
    except Exception as e:
        # Don't fail the solve if recording fails
        print(f"⚠️ Training data recording failed: {e}", file=sys.stderr)


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

        # Record training data for ML (non-blocking)
        _record_training_data(solver_input, result)

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
