import json

with open("test_input_12_16.json") as f:
    payload = json.load(f)

solver_input = payload.get("solverInput") or payload

# Check coverage windows for register (roleId=30)
cw = [w for w in solver_input.get("coverageWindows", []) if w.get("roleId") == 30]
print("Register coverage windows:")
for w in cw:
    start_h = w["startMin"] // 60
    start_m = w["startMin"] % 60
    end_h = w["endMin"] // 60
    end_m = w["endMin"] % 60
    crew_req = w["crewPerMinute"]
    print(f"  {start_h}:{start_m:02d} - {end_h}:{end_m:02d}: {crew_req} crew required")

# Count total register-hours needed
total_crew_hours = sum((w["endMin"] - w["startMin"]) * w["crewPerMinute"] / 60 for w in cw)
print(f"\nTotal register crew-hours needed: {total_crew_hours:.1f}")

# Check crew with register role (roleId=30)
crew_with_register = [c for c in solver_input.get("crew", []) if 30 in c.get("roleIds", [])]
print(f"Crew with register role: {len(crew_with_register)}")

# Check MAX_CONSECUTIVE_MINUTES for register
rules = solver_input.get("roleRules", [])
max_consec_register = [r for r in rules if r.get("type") == "MAX_CONSECUTIVE_MINUTES" and r.get("roleId") == 30]
print(f"\nMAX_CONSECUTIVE_MINUTES rules for register: {len(max_consec_register)}")
values = set(r.get("valueInt") for r in max_consec_register)
print(f"Unique values: {sorted(values)}")

# Count by value
by_value = {}
for r in max_consec_register:
    v = r.get("valueInt")
    by_value[v] = by_value.get(v, 0) + 1
print("By value:", by_value)

# Check crew without any MAX_CONSECUTIVE_MINUTES rule for register
crew_ids_with_rule = set(r.get("crewId") for r in max_consec_register)
crew_without = [c for c in crew_with_register if c["id"] not in crew_ids_with_rule]
print(f"\nCrew with register but NO MAX_CONSECUTIVE_MINUTES rule: {len(crew_without)}")

# Check how rules are being applied - is it constraint or preference?
constraint_types = set(r.get("constraintType") for r in max_consec_register)
print(f"Constraint types: {constraint_types}")
