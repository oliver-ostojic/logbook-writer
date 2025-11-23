"""CLI entrypoint for the logbook solver."""

from __future__ import annotations

import json
import sys

from .core import LogbookSolver


def main() -> None:
    """Read JSON from stdin, solve, and emit JSON to stdout."""

    try:
        input_data = json.load(sys.stdin)
        solver = LogbookSolver(input_data)
        result = solver.solve()
        print(json.dumps(result, indent=2))
    except Exception as exc:  # pragma: no cover - CLI safety net
        error_result = {
            'success': False,
            'metadata': {
                'status': 'ERROR',
                'runtimeMs': 0,
                'numCrew': 0,
                'numSlots': 0,
                'numAssignments': 0,
                'violations': [str(exc)]
            },
            'error': str(exc)
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == '__main__':  # pragma: no cover
    main()
