"""Metadata-driven solver (Phase 2) scaffolding package.

This package mirrors the high-level architecture described in SOLVER_REFACTOR_PLAN.md:
- ``time_grid`` builds the discrete slot grid per store.
- ``variables`` enumerates decision variables for each assignment model.
- ``constraints`` attaches guardrails and demand equations.
- ``objective`` generates objective coefficients (preferences, fairness, policies).
- ``solver_v2`` wires the pipeline together for the OR-Tools backend.

Each module currently exposes placeholder types/functions so the API can import or
execute them once the CP-SAT implementation is ready.
"""

from .solver_v2 import SolverV2Engine

__all__ = ["SolverV2Engine"]
