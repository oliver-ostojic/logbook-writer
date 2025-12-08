"""Objective builder for SolverV2."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from .solver_v2 import SolverV2


def apply(solver: "SolverV2") -> None:
    model = solver.model
    weighted_terms = []

    for key, var in solver.assignment_vars.items():
        weight = solver.preference_weight(key)
        if weight <= 0:
            continue
        weighted_terms.append(weight * var)

    if weighted_terms:
        model.Maximize(sum(weighted_terms))
    else:
        model.Maximize(0)


__all__ = ["apply"]
