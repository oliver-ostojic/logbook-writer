# Logbook MILP Solver (Python)

This directory contains the Python OR-Tools solver for daily logbook scheduling.

## Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt
```

## Usage

The solver reads JSON input from stdin and writes JSON output to stdout:

```bash
# Test with sample data
echo '{"date":"2025-11-19","store":{...},"crew":[...],...}' | python solver.py
```

## Input Format

See TypeScript types in `packages/shared-types/src/solver.ts` for the complete input schema.

## Output Format

Returns a JSON object with:
- `success`: boolean
- `metadata`: solver status, runtime, objective score
- `assignments`: array of task assignments (if successful)
- `error`: error message (if failed)
