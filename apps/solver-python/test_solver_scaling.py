#!/usr/bin/env python3
"""
Test the solver with different crew sizes (10, 20, 30) to validate scaling behavior.
Loads crew from DB export, generates test data, runs solver, and reports results.
"""

import json
import subprocess
import sys
from datetime import datetime
import random

# Configuration
CREW_SIZES = [10, 20, 30]
DB_EXPORT_PATH = '../api/crew_roles_export.json'
RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# Shift start distribution (percentages)
SHIFT_DISTRIBUTION = [
    (5, 0.23),   # 5 am
    (6, 0.179),  # 6 am
    (8, 0.018),  # 8 am
    (10, 0.054), # 10 am
    (11, 0.054), # 11 am
    (12, 0.107), # 12 pm
    (13, 0.107), # 1 pm
    (14, 0.25),  # 2 pm
]

def pick_shift_start():
    """Pick a shift start hour based on the distribution."""
    r = random.random()
    acc = 0.0
    for hour, pct in SHIFT_DISTRIBUTION:
        acc += pct
        if r < acc:
            return hour
    return SHIFT_DISTRIBUTION[-1][0]

def load_crew_roles():
    """Load crew and roles from DB export (all crew are from store 768)."""
    with open(DB_EXPORT_PATH, 'r') as f:
        crew_list = json.load(f)
    
    if not crew_list:
        raise ValueError("No crew found in DB export")
    
    print(f"Loaded {len(crew_list)} crew members from store 768")
    return crew_list

def select_crew(all_crew, size):
    """Randomly select crew of given size."""
    if len(all_crew) < size:
        raise ValueError(f"Not enough crew in DB for size {size}. Only {len(all_crew)} available.")
    return random.sample(all_crew, size)

def assign_shifts(crew):
    """Assign shift start times and lengths to crew."""
    for c in crew:
        start_hour = pick_shift_start()
        c['shiftStartMin'] = start_hour * 60
        c['shiftEndMin'] = (start_hour + 8) * 60  # 8-hour shift

def assign_preferences(crew):
    """Assign realistic preferences to crew members."""
    for c in crew:
        roles = c.get('roles', [])
        if not roles:
            continue
        
        role_names = [r['role'] for r in roles]
        
        # 1. First hour task preference (if they have REGISTER or PRODUCT)
        if 'REGISTER' in role_names or 'PRODUCT' in role_names:
            c['prefFirstHour'] = random.choice(['REGISTER', 'PRODUCT']) if 'REGISTER' in role_names and 'PRODUCT' in role_names else (role_names[0] if role_names[0] in ['REGISTER', 'PRODUCT'] else None)
            c['prefFirstHourWeight'] = random.choice([0, 50, 100]) if c.get('prefFirstHour') else 0
        
        # 2. Product vs Register bias (overall task preference)
        if 'REGISTER' in role_names and 'PRODUCT' in role_names:
            c['prefTask'] = random.choice(['REGISTER', 'PRODUCT'])
            c['prefTaskWeight'] = random.choice([0, 25, 50, 75])
        
        # 3. Product block size preference (switch penalty)
        if 'PRODUCT' in role_names:
            c['prefBlocksizeProdWeight'] = random.choice([0, 10, 25, 50])
        
        # 4. Register block size preference (switch penalty)
        if 'REGISTER' in role_names:
            c['prefBlocksizeRegWeight'] = random.choice([0, 10, 25, 50])
        
        # 5. Break timing preference (-1 = earlier, 0 = no preference, +1 = later)
        c['prefBreakTiming'] = random.choice([-1, 0, 1])
        c['prefBreakTimingWeight'] = random.choice([0, 25, 50]) if c['prefBreakTiming'] != 0 else 0
        
        # 6. Parking helms preference (handled by distance-from-first penalty in solver)
        c['canParkingHelms'] = True  # All crew can do parking helms by default
        
        # 7. Meal breaks
        c['canBreak'] = True  # All crew can take breaks

def build_role_metadata(crew):
    """Build role metadata from crew roles."""
    role_meta_map = {}
    for c in crew:
        if c.get('roles'):
            for r in c['roles']:
                role_name = r['role']
                if role_name not in role_meta_map:
                    role_meta_map[role_name] = {
                        'role': role_name,
                        'assignmentMode': r.get('assignmentMode', 'INDIVIDUAL_HOURS'),
                        'isConsecutive': r.get('isConsecutive', False),
                        'detail': r.get('detail', '')
                    }
    return list(role_meta_map.values())

def build_crew_role_requirements(crew):
    """Build per-crew role requirements for INDIVIDUAL_HOURS roles."""
    reqs = []
    for c in crew:
        if c.get('roles'):
            for role_obj in c['roles']:
                if role_obj.get('assignmentMode') == 'INDIVIDUAL_HOURS':
                    reqs.append({
                        'crewId': c['id'],
                        'role': role_obj['role'],
                        'requiredHours': random.choice([1, 2])
                    })
    return reqs

def build_hourly_requirements(crew, store):
    """Build hourly staffing requirements based on crew availability.
    
    Requirements must account for:
    - All crew must be assigned to exactly one task per hour (Constraint 1)
    - Crew on meal breaks are not available for tasks
    - Requirements must sum to available crew minus those on break
    """
    start_hour = store['regHoursStartMin'] // 60
    end_hour = store['regHoursEndMin'] // 60
    
    # Calculate available crew per hour (excluding potential breaks)
    crew_availability = {h: 0 for h in range(start_hour, end_hour)}
    for c in crew:
        shift_start = c['shiftStartMin'] // 60
        shift_end = c['shiftEndMin'] // 60
        for h in range(shift_start, shift_end):
            if h in crew_availability:
                crew_availability[h] += 1
    
    # Build requirements
    # Strategy: Assume roughly 1 crew on break per hour during mid-shift
    # Distribute remaining crew across REG/PROD/PARK
    reqs = []
    for h in range(start_hour, end_hour):
        available = crew_availability[h]
        
        if available == 0:
            reqs.append({
                'hour': h,
                'requiredRegister': 0,
                'requiredProduct': 0,
                'requiredParkingHelm': 0
            })
            continue
        
        # Estimate crew on breaks (roughly 1-2 per hour during peak)
        estimated_breaks = min(1, available // 5) if h >= 8 and h <= 16 else 0
        available_for_tasks = max(1, available - estimated_breaks)
        
        # Split tasks: ~40% REG, ~40% PROD, ~20% PARK
        req_register = max(1, int(available_for_tasks * 0.4))
        req_product = max(1, int(available_for_tasks * 0.4))
        req_parking = max(0, available_for_tasks - req_register - req_product)
        
        reqs.append({
            'hour': h,
            'requiredRegister': req_register,
            'requiredProduct': req_product,
            'requiredParkingHelm': req_parking
        })
    return reqs

def build_coverage_windows(crew):
    """Build coverage windows for TEAM_WINDOW roles (DEMO, WINE_DEMO).
    
    CONSTRAINT: Each crew can only work 1 hour total of DEMO/WINE_DEMO per day.
    This means window length is limited by the number of unique eligible crew.
    
    Uses longest-window strategy: Find the longest contiguous time window where
    we have enough unique crew to cover all hours (1 crew/hour).
    """
    # Build crew availability by hour for each role
    role_crew_by_hour = {}
    
    for c in crew:
        shift_start_hour = c['shiftStartMin'] // 60
        shift_end_hour = c['shiftEndMin'] // 60
        
        if c.get('roles'):
            for r in c['roles']:
                if r['role'] in ['DEMO', 'WINE_DEMO']:
                    role = r['role']
                    if role not in role_crew_by_hour:
                        role_crew_by_hour[role] = {h: set() for h in range(24)}
                    
                    # Add this crew to all hours they're working
                    for h in range(shift_start_hour, shift_end_hour):
                        role_crew_by_hour[role][h].add(c['id'])
    
    windows = []
    
    for role, crew_by_hour in role_crew_by_hour.items():
        # Find longest contiguous window
        max_length = 0
        best_window = None
        
        for start_hour in range(24):
            if not crew_by_hour[start_hour]:
                continue
            
            # Try extending from this start hour
            for end_hour in range(start_hour + 1, 25):
                # Count unique crew across [start_hour, end_hour)
                unique_crew = set()
                for h in range(start_hour, end_hour):
                    unique_crew.update(crew_by_hour[h])
                
                window_length = end_hour - start_hour
                crew_count = len(unique_crew)
                
                # We need as many crew as hours in the window
                if crew_count < window_length:
                    break
                
                # Check all hours have at least 1 crew
                all_covered = all(
                    len(crew_by_hour[h]) > 0
                    for h in range(start_hour, end_hour)
                )
                
                if not all_covered:
                    break
                
                # This is a valid window
                if window_length > max_length:
                    max_length = window_length
                    best_window = {
                        'role': role,
                        'startHour': start_hour,
                        'endHour': end_hour,
                        'requiredPerHour': 1
                    }
        
        if best_window:
            windows.append(best_window)
    
    return windows

def generate_test_data(crew_size):
    """Generate test data for given crew size."""
    all_crew = load_crew_roles()
    selected_crew = select_crew(all_crew, crew_size)
    assign_shifts(selected_crew)
    assign_preferences(selected_crew)
    
    store = {
        'id': 768,
        'name': 'Test Store',
        'regHoursStartMin': 5 * 60,  # 5am
        'regHoursEndMin': 17 * 60    # 5pm
    }
    
    data = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'store': store,
        'crew': selected_crew,
        'roleMetadata': build_role_metadata(selected_crew),
        'crewRoleRequirements': build_crew_role_requirements(selected_crew),
        'hourlyRequirements': build_hourly_requirements(selected_crew, store),
        'coverageWindows': build_coverage_windows(selected_crew),
        'timeLimitSeconds': 90
    }
    
    return data

def run_solver(test_data):
    """Run the solver with test data and return results."""
    input_json = json.dumps(test_data)
    
    try:
        result = subprocess.run(
            ['venv/bin/python', 'solver.py'],
            input=input_json,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode != 0:
            print(f"Solver failed with exit code {result.returncode}")
            print(f"STDERR: {result.stderr}")
            return None
        
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        print("Solver timed out!")
        return None
    except Exception as e:
        print(f"Error running solver: {e}")
        return None

def analyze_crew_availability(test_data):
    """Analyze crew availability and requirements by hour."""
    crew = test_data['crew']
    hourly_requirements = test_data['hourlyRequirements']
    
    # Calculate crew availability per hour
    availability = {}
    for hour in range(24):
        availability[hour] = {
            'total': 0,
            'REGISTER': 0,
            'PRODUCT': 0,
            'PARKING_HELM': 0,
            'DEMO': 0,
            'WINE_DEMO': 0
        }
    
    for c in crew:
        shift_start_hour = c['shiftStartMin'] // 60
        shift_end_hour = c['shiftEndMin'] // 60
        roles = [r['role'] for r in c.get('roles', [])]
        
        for hour in range(shift_start_hour, shift_end_hour):
            if hour in availability:
                availability[hour]['total'] += 1
                for role in roles:
                    if role in availability[hour]:
                        availability[hour][role] += 1
    
    # Build requirements lookup
    requirements = {}
    for req in hourly_requirements:
        hour = req['hour']
        requirements[hour] = {
            'REGISTER': req.get('requiredRegister', 0),
            'PRODUCT': req.get('requiredProduct', 0),
            'PARKING_HELM': req.get('requiredParkingHelm', 0)
        }
    
    return availability, requirements

def print_availability_table(test_data):
    """Print a table showing crew availability vs requirements by hour."""
    availability, requirements = analyze_crew_availability(test_data)
    
    print(f"\n{'─' * 120}")
    print("CREW AVAILABILITY vs REQUIREMENTS BY HOUR")
    print(f"{'─' * 120}")
    print(f"{'Hour':<6} {'Total':<8} {'REG Avail':<12} {'REG Need':<10} {'PROD Avail':<12} {'PROD Need':<10} {'PARK Avail':<12} {'PARK Need':<10}")
    print(f"{'─' * 120}")
    
    for hour in sorted(availability.keys()):
        avail = availability[hour]
        req = requirements.get(hour, {})
        
        # Only show hours with activity
        if avail['total'] > 0 or any(req.values()):
            reg_avail = avail['REGISTER']
            reg_need = req.get('REGISTER', 0)
            prod_avail = avail['PRODUCT']
            prod_need = req.get('PRODUCT', 0)
            park_avail = avail['PARKING_HELM']
            park_need = req.get('PARKING_HELM', 0)
            
            # Highlight violations with *
            reg_status = f"{reg_avail}" if reg_avail >= reg_need else f"{reg_avail}*"
            prod_status = f"{prod_avail}" if prod_avail >= prod_need else f"{prod_avail}*"
            park_status = f"{park_avail}" if park_avail >= park_need else f"{park_avail}*"
            
            print(f"{hour:<6} {avail['total']:<8} {reg_status:<12} {reg_need:<10} {prod_status:<12} {prod_need:<10} {park_status:<12} {park_need:<10}")
    
    print(f"{'─' * 120}")
    print("* = Insufficient crew available to meet requirement")
    print()

def main():
    """Run scaling tests for different crew sizes."""
    print("=" * 80)
    print("SOLVER SCALING TEST")
    print("=" * 80)
    print()
    
    results = {}
    
    for size in CREW_SIZES:
        print(f"\n{'=' * 80}")
        print(f"Testing with {size} crew members")
        print(f"{'=' * 80}")
        
        # Generate test data
        print(f"Generating test data for {size} crew...")
        test_data = generate_test_data(size)
        
        # Save test data
        output_file = f'test_crew_{size}.json'
        with open(output_file, 'w') as f:
            json.dump(test_data, f, indent=2)
        print(f"Saved test data to {output_file}")
        
        # Print availability table
        print_availability_table(test_data)
        
        # Run solver
        print(f"Running solver...")
        result = run_solver(test_data)
        
        if result:
            results[size] = result
            metadata = result.get('metadata', {})
            
            print(f"\n{'─' * 80}")
            print(f"RESULTS FOR {size} CREW:")
            print(f"{'─' * 80}")
            print(f"  Status:           {metadata.get('status', 'UNKNOWN')}")
            print(f"  Success:          {result.get('success', False)}")
            print(f"  Runtime:          {metadata.get('runtimeMs', 0)} ms")
            print(f"  Objective Score:  {metadata.get('objectiveScore', 'N/A')}")
            print(f"  Assignments:      {metadata.get('numAssignments', 0)}")
            print(f"  MIP Gap:          {metadata.get('mipGap', 'N/A')}")
            
            if not result.get('success'):
                violations = metadata.get('violations', [])
                if violations:
                    print(f"\n  CONSTRAINT VIOLATIONS ({len(violations)} total):")
                    # Show first 10 violations
                    for i, violation in enumerate(violations[:10]):
                        print(f"    {i+1}. {violation}")
                    if len(violations) > 10:
                        print(f"    ... and {len(violations) - 10} more violations")
        else:
            print(f"\n✗ Solver failed for {size} crew")
            results[size] = None
    
    # Summary
    print(f"\n\n{'=' * 80}")
    print("SUMMARY")
    print(f"{'=' * 80}")
    print(f"{'Size':<10} {'Status':<15} {'Runtime (ms)':<15} {'Assignments':<15} {'Objective':<15}")
    print(f"{'-' * 80}")
    
    for size in CREW_SIZES:
        result = results.get(size)
        if result:
            metadata = result.get('metadata', {})
            status = metadata.get('status', 'UNKNOWN')
            runtime = metadata.get('runtimeMs', 0)
            assignments = metadata.get('numAssignments', 0)
            objective = metadata.get('objectiveScore')
            objective_str = str(objective) if objective is not None else 'N/A'
            print(f"{size:<10} {status:<15} {runtime:<15} {assignments:<15} {objective_str:<15}")
        else:
            print(f"{size:<10} {'FAILED':<15} {'-':<15} {'-':<15} {'-':<15}")
    
    print()

if __name__ == '__main__':
    main()
