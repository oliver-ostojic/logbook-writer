"""Normalizes raw solver payloads into SolverInputV2 shape."""

from __future__ import annotations

from typing import Any, Dict


def normalize_payload(raw_payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = _extract_inner_payload(raw_payload)

    if 'store' in payload and 'roles' in payload:
        return payload

    raise ValueError(
        "Solver payload is not in SolverInputV2 format (missing 'store' or 'roles' keys). "
        "Legacy payload format is no longer supported."
    )


def _extract_inner_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    if 'solverInput' in raw and isinstance(raw['solverInput'], dict):
        return raw['solverInput']
    return raw


__all__ = ["normalize_payload"]
