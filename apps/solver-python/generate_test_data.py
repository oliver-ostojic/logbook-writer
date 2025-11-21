
import random
import json
from datetime import datetime, timedelta

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

CREW_SIZES = [5, 10, 20, 30]
RANDOM_SEED = 42
random.seed(RANDOM_SEED)

def pick_shift_start():
    r = random.random()
    acc = 0.0
    for hour, pct in SHIFT_DISTRIBUTION:
        acc += pct
        if r < acc:
            return hour
    return SHIFT_DISTRIBUTION[-1][0]

def load_crew_roles():
    with open('../api/crew_roles_export.json', 'r') as f:
        return json.load(f)

def select_crew(crew_roles, size):
    # Select a random subset of crew (some with roles, some without)
    if len(crew_roles) < size:
        raise ValueError(f"Not enough crew in DB for size {size}")
    return random.sample(crew_roles, size)

def generate_role_requirements(crew):
    reqs = []
    for c in crew:
        if c['roles']:
            for role_obj in c['roles']:
                # Only create requirement for INDIVIDUAL_HOURS assignmentMode
                if role_obj.get('assignmentMode') == 'INDIVIDUAL_HOURS':
                    reqs.append({
                        "crewId": c['id'],
                        "role": role_obj['role'],
                        "requiredHours": random.choice([1, 2])
                    })
    return reqs

def generate_coverage_windows(crew, strategy='random'):
    # Find all team-window roles among crew with roles
    team_window_roles = set()
    for c in crew:
        if c['roles']:
            for r in c['roles']:
                if r['role'] in ['DEMO', 'WINE_DEMO']:
                    team_window_roles.add(r['role'])
    windows = []
    for role in team_window_roles:
        if strategy == 'random':
            start = random.choice(range(480, 900, 60)) # between 8am and 3pm
            end = start + random.choice([120, 180, 240]) # 2-4 hours
        else: # longest-window
            start = 480 # 8am
            end = 1020 # 5pm
        windows.append({
            "role": role,
            "windowStart": start,
            "windowEnd": end,
            "requiredPerHour": 1
        })
    return windows

def generate_hourly_requirements(crew, store):
    # Generate hourly requirements from store start to end
    start_hour = store["regHoursStartMin"] // 60
    end_hour = store["regHoursEndMin"] // 60
    reqs = []
    # Calculate available crew per hour
    crew_availability = {h: 0 for h in range(start_hour, end_hour)}
    for c in crew:
        shift_start = c.get("shiftStartMin", 480) // 60
        shift_end = shift_start + c.get("shiftLength", 8)
        for h in range(shift_start, shift_end):
            if h in crew_availability:
                crew_availability[h] += 1
    print("Crew available per hour during store hours:")
    for h in range(start_hour, end_hour):
        print(f"Hour {h}: {crew_availability[h]} crew")
    # Set requiredRegisters and requiredParkingHelms to feasible values
    for h in range(start_hour, end_hour):
        reqs.append({
            "hour": h,
            "requiredRegisters": max(1, crew_availability[h] // 2),
            "requiredParkingHelms": min(1, crew_availability[h])
        })
    return reqs

def main():
    crew_roles = load_crew_roles()
    for size in CREW_SIZES:
        crew = select_crew(crew_roles, size)
        # Assign shift start times
        for c in crew:
            start_hour = pick_shift_start()
            c["shiftStartHour"] = start_hour
            c["shiftStartMin"] = start_hour * 60
            c["shiftLength"] = 8
        # Store object
        store = {
            "id": 768,
            "name": "Test Store",
            "minRegisterHours": 2,
            "maxRegisterHours": 5,
            "regHoursStartMin": 300,
            "regHoursEndMin": 1020
        }
        # Role requirements (only for crew with roles)
        role_requirements = generate_role_requirements(crew)
        # Build roleMetadata from all roles used in CrewRoleRequirements and coverage windows
        role_meta_map = {}
        # Collect from crew roles
        for c in crew:
            if c['roles']:
                for r in c['roles']:
                    role_name = r['role']
                    if role_name not in role_meta_map:
                        role_meta_map[role_name] = {
                            "role": role_name,
                            "assignmentMode": r.get("assignmentMode", "INDIVIDUAL_HOURS"),
                            "isConsecutive": r.get("isConsecutive", False),
                            "detail": r.get("detail", "")
                        }
        # Also add any roles from coverage windows (for TEAM_WINDOW roles)
        coverage_windows = generate_coverage_windows(crew, strategy='longest')
        for window in coverage_windows:
            role_name = window["role"]
            if role_name not in role_meta_map:
                # Default TEAM_WINDOW metadata if not present in crew
                role_meta_map[role_name] = {
                    "role": role_name,
                    "assignmentMode": "TEAM_WINDOW",
                    "isConsecutive": False,
                    "detail": ""
                }
        role_metadata = list(role_meta_map.values())
        # Hourly requirements
        hourly_requirements = generate_hourly_requirements(crew, store)
        # Date
        date = "2025-11-20"
        # Coverage windows: use only the optimal (longest-window) strategy
        coverage_windows = generate_coverage_windows(crew, strategy='longest')
        test_data = {
            "date": date,
            "store": store,
            "crew": crew,
            "crewRoleRequirements": role_requirements,
            "hourlyRequirements": hourly_requirements,
            "coverageWindows": coverage_windows,
            "roleMetadata": role_metadata,
            "timeLimitSeconds": 120
        }
        with open(f"test_crew_{size}.json", "w") as f:
            json.dump(test_data, f, indent=2)
        print(f"Generated test_crew_{size}.json with {size} crew members, date {date}, store id {store['id']}.")

if __name__ == "__main__":
    main()
