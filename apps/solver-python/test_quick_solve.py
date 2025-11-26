"""Quick test to see if solver can find a solution."""

import json
from logbook_solver.core import LogbookSolver

print('Loading data...')
with open('solver_input_11_22_v5.json', 'r') as f:
    data = json.load(f)

# Set a short time limit
data['timeLimitSeconds'] = 30

print('Creating solver...')
solver = LogbookSolver(data)

print(f'Store hours: {solver.open_minutes}-{solver.close_minutes} ({solver.open_minutes//60}:00-{solver.close_minutes//60}:00)')
print(f'Num decision variables created: {len(solver.x)}')

print('Starting solve (30 second limit)...')
result = solver.solve()

print(f'Done! Success: {result.get("success")}')
print(f'Status: {result.get("metadata", {}).get("status")}')
print(f'Runtime: {result.get("metadata", {}).get("runtimeMs")}ms')

if not result.get('success'):
    print(f'Violations: {result.get("metadata", {}).get("violations")}')
