"""Minimal test to verify CP-SAT can solve sum(23 vars) == 10"""
from ortools.sat.python import cp_model

def test_basic():
    model = cp_model.CpModel()
    
    # Create 23 boolean variables
    vars_ = [model.NewBoolVar(f"v{i}") for i in range(23)]
    
    # Add constraint: exactly 10 must be true
    model.Add(sum(vars_) == 10)
    
    # Solve
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    
    print(f"Status: {solver.StatusName(status)}")
    print(f"Status code: {status}")
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        count = sum(solver.Value(v) for v in vars_)
        print(f"Solution found! Count of true vars: {count}")
    else:
        print("NO SOLUTION - this should never happen!")

if __name__ == "__main__":
    test_basic()
