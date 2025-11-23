#!/usr/bin/env python3
"""Compatibility wrapper for the refactored logbook solver package."""

from logbook_solver import LogbookSolver  # re-export for legacy imports
from logbook_solver.main import main

__all__ = ["LogbookSolver", "main"]


if __name__ == '__main__':
    main()