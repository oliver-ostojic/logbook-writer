#!/usr/bin/env python3
"""
Debug 12/16 infeasibility - analyze payload and run solver with relaxed constraints
"""

import json
import subprocess
import sys

def fetch_payload():
    """Fetch solver payload from API"""
    result = subprocess.run(
        ["curl", "-s", "http://localhost:4000/solver/input/768/2025-12-16"],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

def analyze_payload(data):
    """Analyze payload for potential issues"""
    print("=== Payload Summary for 12/16 ===")
    print(f"Crew: {len(data.get('crew', []))}")
    print(f"Roles: {len(data.get('roles', []))}")
    print(f"Role Rules: {len(data.get('roleRules', []))}")
    print(f"Coverage Windows: {len(data.get('coverageWindows', []))}")
    print(f"Crew Quotas: {len(data.get('crewQuotas', []))}")
    print()
    
    crew = data.get('crew', [])
    crew_with_shifts = [c for c in crew if c.get('shiftStartMin') is not None]
    print(f"Crew with shifts: {len(crew_with_shifts)}")
    
    if crew_with_shifts:
        starts = [c.get('shiftStartMin', 0) for c in crew_with_shifts]
        ends = [c.get('shiftEndMin', 0) for c in crew_with_shifts]
        lengths = [e - s for s, e in zip(starts, ends)]
        print(f"Shift starts: min={min(starts)} ({min(starts)//60}:{min(starts)%60:02d}), max={max(starts)} ({max(starts)//60}:{max(starts)%60:02d})")
        print(f"Shift ends: min={min(ends)} ({min(ends)//60}:{min(ends)%60:02d}), max={max(ends)} ({max(ends)//60}:{max(ends)%60:02d})")
        print(f"Shift lengths: min={min(lengths)}, max={max(lengths)}, avg={sum(lengths)/len(lengths):.0f}")
    
    # Check for suspicious shifts
    print("\n=== Suspicious Shifts ===")
    for c in crew_with_shifts:
        start = c.get('shiftStartMin', 0)
        end = c.get('shiftEndMin', 0)
        length = end - start
        if length <= 0:
            print(f"  ZERO/NEGATIVE: {c.get('name')} ({c.get('id')}): {start}-{end} = {length} min")
        elif length < 120:
            print(f"  TOO SHORT (<2h): {c.get('name')} ({c.get('id')}): {start}-{end} = {length} min")
        elif start < 0 or end > 1440:
            print(f"  OUT OF RANGE: {c.get('name')} ({c.get('id')}): {start}-{end}")
    
    # Coverage windows summary
    cws = data.get('coverageWindows', [])
    if cws:
        print(f"\n=== Coverage Windows ({len(cws)} total) ===")
        by_role = {}
        for cw in cws:
            rid = cw.get('roleId')
            if rid not in by_role:
                by_role[rid] = []
            by_role[rid].append(cw)
        
        for rid, windows in by_role.items():
            total_min = sum(w.get('minCrew', 0) for w in windows)
            print(f"  Role {rid}: {len(windows)} windows, total minCrew demand={total_min}")
    
    # Check crew eligibility per role
    print("\n=== Crew Eligibility ===")
    roles = {r.get('id'): r for r in data.get('roles', [])}
    for role_id, role in roles.items():
        eligible = [c for c in crew_with_shifts if role_id in c.get('roleIds', [])]
        print(f"  {role.get('displayName', role.get('code', role_id))}: {len(eligible)} crew eligible")
    
    # Check role rules that might cause conflicts
    rules = data.get('roleRules', [])
    crew_rules = [r for r in rules if r.get('source') == 'crew']
    store_rules = [r for r in rules if r.get('source') == 'store']
    print(f"\n=== Role Rules ===")
    print(f"  Crew rules: {len(crew_rules)}")
    print(f"  Store rules: {len(store_rules)}")
    
    # Group by type
    by_type = {}
    for r in rules:
        t = r.get('type', 'UNKNOWN')
        if t not in by_type:
            by_type[t] = 0
        by_type[t] += 1
    print("  By type:")
    for t, count in sorted(by_type.items()):
        print(f"    {t}: {count}")

def main():
    print("Fetching payload from API...")
    try:
        data = fetch_payload()
    except Exception as e:
        print(f"Failed to fetch: {e}")
        print("Trying local file...")
        with open('solver_input_768_2025-12-16.json') as f:
            data = json.load(f)
    
    # Save for reference
    with open('solver_input_768_2025-12-16.json', 'w') as f:
        json.dump(data, f, indent=2)
    print("Saved to solver_input_768_2025-12-16.json\n")
    
    analyze_payload(data)

if __name__ == "__main__":
    main()
