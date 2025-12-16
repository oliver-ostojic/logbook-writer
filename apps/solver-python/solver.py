#!/usr/bin/env python3
"""Wrapper for the v2 logbook solver - the v1 solver has been removed."""

from logbook_solver_v2 import solve, SolverV2
from logbook_solver_v2.cli import main

__all__ = ["solve", "SolverV2", "main"]


if __name__ == '__main__':
    main()