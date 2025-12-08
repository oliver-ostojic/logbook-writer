"""
Reproduce the exact hour 8 Register scenario:
- 23 crew members available at hour 8
- Each crew has a shift with multiple slots
- Need 10 Register assignments at hour 8
- Guardrail: each slot must have exactly one role
- role_min: each crew must have at least 2 Product slots
"""
from ortools.sat.python import cp_model

def test_with_guardrails():
    model = cp_model.CpModel()
    
    # Simulate 23 crew members, each with 8 slots (4 hours of work)
    # Slot 0 = hour 8 for simplicity
    NUM_CREW = 23
    SLOTS_PER_CREW = 8  # 4 hours = 8 half-hour slots
    REGISTER_HOUR_SLOT = 0  # hour 8 maps to slot 0 for each crew
    
    # For each crew, for each slot, create variables for each role
    # Roles: Register (only at slot 0-1), Product (any slot), Break (any slot)
    
    register_vars = {}  # (crew, slot) -> var (only slots 0-1 for 1hr block)
    product_vars = {}   # (crew, slot) -> var
    break_vars = {}     # (crew, slot) -> var
    
    for crew in range(NUM_CREW):
        for slot in range(SLOTS_PER_CREW):
            product_vars[(crew, slot)] = model.NewBoolVar(f"prod_{crew}_{slot}")
            break_vars[(crew, slot)] = model.NewBoolVar(f"break_{crew}_{slot}")
        
        # Register only at slots 0-1 (hour 8, blockSize=2)
        # Actually, Register block covers 2 slots, so one variable for slots 0-1
        register_vars[(crew, 0)] = model.NewBoolVar(f"reg_{crew}_0")
    
    # GUARDRAIL: Each slot must have exactly one role
    for crew in range(NUM_CREW):
        for slot in range(SLOTS_PER_CREW):
            slot_vars = [product_vars[(crew, slot)], break_vars[(crew, slot)]]
            # Register covers slots 0 and 1
            if slot in [0, 1]:
                slot_vars.append(register_vars[(crew, 0)])
            model.Add(sum(slot_vars) == 1)
    
    # HOURLY: Need exactly 10 Register at hour 8
    reg_hour8_vars = [register_vars[(crew, 0)] for crew in range(NUM_CREW)]
    model.Add(sum(reg_hour8_vars) == 10)
    
    # ROLE_MIN: Each crew needs at least 2 Product slots
    for crew in range(NUM_CREW):
        crew_product_vars = [product_vars[(crew, slot)] for slot in range(SLOTS_PER_CREW)]
        model.Add(sum(crew_product_vars) >= 2)
    
    # ROLE_MIN: Each crew needs exactly 1 Break slot
    for crew in range(NUM_CREW):
        crew_break_vars = [break_vars[(crew, slot)] for slot in range(SLOTS_PER_CREW)]
        model.Add(sum(crew_break_vars) == 1)
    
    print(f"Variables: {len(model.Proto().variables)}")
    print(f"Constraints: {len(model.Proto().constraints)}")
    
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    
    print(f"\nStatus: {solver.StatusName(status)}")
    
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        reg_count = sum(solver.Value(register_vars[(crew, 0)]) for crew in range(NUM_CREW))
        print(f"Register assignments at hour 8: {reg_count}")
    else:
        print("INFEASIBLE!")
        
def test_minimal_hourly_only():
    """Just the hourly constraint, nothing else"""
    model = cp_model.CpModel()
    
    NUM_CREW = 23
    register_vars = [model.NewBoolVar(f"reg_{i}") for i in range(NUM_CREW)]
    
    # Only constraint: exactly 10 Register
    model.Add(sum(register_vars) == 10)
    
    print(f"\n=== MINIMAL TEST (hourly only) ===")
    print(f"Variables: {len(model.Proto().variables)}")
    print(f"Constraints: {len(model.Proto().constraints)}")
    
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    print(f"Status: {solver.StatusName(status)}")

if __name__ == "__main__":
    print("=== TEST WITH GUARDRAILS + ROLE_MIN ===")
    test_with_guardrails()
    
    test_minimal_hourly_only()
