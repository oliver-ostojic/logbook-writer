#!/usr/bin/env python3
"""Command-line wrapper for the metadata-driven solver v2."""

from __future__ import annotations

import json
import sys

from logbook_solver_v2 import solve


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        result = solve(payload)
        print(json.dumps(result, indent=2))
    except Exception as exc:  # pragma: no cover - CLI safety
        error = {
            'success': False,
            'metadata': {
                'status': 'ERROR',
                'runtimeMs': 0,
                'numCrew': 0,
                'numSlots': 0,
                'numAssignments': 0,
                'violations': [str(exc)],
            },
            'error': str(exc),
        }
        print(json.dumps(error, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()
