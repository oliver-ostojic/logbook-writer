# Role Rules Implementation Plan

This document outlines the step-by-step process to implement the new `RoleRule` system, which allows defining constraints and preferences at the role level that can be applied store-wide or per-crew.

---

## Schema Overview

### New Models
```
RoleRule        - Defines a rule type for a role (e.g., REGISTER CANNOT_BE_ASSIGNED_BEFORE PARKING_HELM)
CrewRoleRule    - Links a crew member to a RoleRule (opt-in/override)
StoreRoleRule   - Links a store to a RoleRule (store-wide default)
```

### RoleRuleType Enum

**valueInt convention:** All `valueInt` fields are in **minutes**, except:
- `-1/0/1` semantic values (TIMING, DISTRIBUTION_BETWEEN_ROLE_X)
- Count values (MAX_CREW_ON_AT_A_TIME)

| Type | Uses targetRoleId? | valueInt Unit | Description |
|------|-------------------|---------------|-------------|
| `CANNOT_BE_ASSIGNED_BEFORE` | ✅ | ❌ | Role X cannot come before targetRole Y in a shift |
| `CANNOT_BE_ASSIGNED_AFTER` | ✅ | ❌ | Role X cannot come after targetRole Y |
| `MIN_BLOCKSIZE` | ❌ | minutes | Minimum consecutive time on role (60 = 1hr minimum) |
| `MAX_BLOCKSIZE` | ❌ | minutes | Maximum consecutive time on role (60 = 1hr max) |
| `FORBID_ROLE` | ❌ | ❌ | Crew cannot be assigned this role at all |
| `TIMING` | ❌ | -1/0/1 | Prefer role early(-1)/middle(0)/late(1) in shift |
| `LIKE_ROLE_FOR_HOUR_X` | ❌ | minutes | Prefer role at shift minute X (60 = hr 1, 120 = hr 2) |
| `DISLIKE_ROLE_FOR_HOUR_X` | ❌ | minutes | Avoid role at shift minute X |
| `MIN_SHIFT_LENGTH_FOR_ACCESS` | ❌ | minutes | Only crew with shift >= X min can be assigned |
| `MAX_CONSECUTIVE_MINUTES_ON_ROLE` | ❌ | minutes | Max time in one block on role |
| `ASSIGN_BEFORE_SHIFT_MIN_X` | ❌ | minutes | Must assign before shift minute X |
| `ASSIGN_AFTER_SHIFT_MIN_X` | ❌ | minutes | Must assign after shift minute X |
| `MAX_CREW_ON_AT_A_TIME` | ❌ | count | Max crew on this role simultaneously |
| `ALLOW_HALF_BLOCKSIZE` | ❌ | ❌ | Allow half-taskLength blocks for gap-filling |
| `DISTRIBUTION_BETWEEN_ROLE_X` | ✅ | -1/0/1 | Balance(0)/favor self(-1)/favor target(1) between role families |

### MIN_BLOCKSIZE / MAX_BLOCKSIZE - Detailed Spec

These rules control the minimum/maximum consecutive time a crew can be assigned to a role.

**valueInt is in minutes:**
- `MIN_BLOCKSIZE: 60` → minimum 60-minute assignment
- `MAX_BLOCKSIZE: 120` → maximum 120-minute (2 hour) assignment

**Examples:**

| Role | taskLength | Rule | valueInt | Effect |
|------|------------|------|----------|--------|
| REGISTER | 60 min | `MIN_BLOCKSIZE` | 60 | Min 60-min assignment |
| REGISTER | 60 min | `MAX_BLOCKSIZE` | 60 | Max 60-min assignment (exactly 1 hour) |
| REGISTER | 60 min | `MIN_BLOCKSIZE` | 120 | Min 2-hour assignment |
| PARKING_HELM | 30 min | `MIN_BLOCKSIZE` | 30 | Min 30-min assignment |
| PARKING_HELM | 30 min | `MAX_BLOCKSIZE` | 60 | Max 60-min assignment |

**Use case: REGISTER must be exactly 1 hour at a time**
```sql
-- Min 60 min AND Max 60 min = exactly 1 hour stints
INSERT INTO "RoleRule" (roleId, type, valueInt, constraintType) VALUES
  ((SELECT id FROM "Role" WHERE code = 'REGISTER'), 'MIN_BLOCKSIZE', 60, 'HARD'),
  ((SELECT id FROM "Role" WHERE code = 'REGISTER'), 'MAX_BLOCKSIZE', 60, 'HARD');
```

**Current Implementation (v2 Solver):**

Location: `apps/solver-python/logbook_solver_v2/`

The v2 solver is **taskLength-driven**:
- Variables are `(crew_id, slot, role_id, task_slots)` - 4th dimension is task length in slots
- `Role.taskLength` (minutes) → converted to slots via `time_grid.task_length_to_slots()`
- `Role.canSplitForGaps` allows half-length variables for gap-filling

From `variables.py`:
```python
# Get task length in minutes (default to grid slot size)
task_length = role.get('taskLength') or self.time_grid.slot_minutes
task_slots = self.time_grid.task_length_to_slots(task_length)
can_split = role.get('canSplitForGaps', False)

# Determine which task sizes to create variables for
task_sizes = [task_slots]
if can_split and task_slots > 1:
    # Add half-length variables for gap-filling
    half_slots = task_slots // 2
    if half_slots >= 1:
        task_sizes.append(half_slots)
```

**Implementation in v2 Solver:**

The key insight: with `MIN_BLOCKSIZE=60` and `MAX_BLOCKSIZE=60` for REGISTER, we only allow exactly 60-min stints. No back-to-back assignments of the same role.

```python
def _apply_blocksize_rules(solver: "SolverV2") -> None:
    """Apply MIN_BLOCKSIZE and MAX_BLOCKSIZE rules (valueInt is in minutes)."""
    
    # Group rules by role
    min_rules = {}  # role_id -> (min_minutes, crew_filter, is_hard)
    max_rules = {}  # role_id -> (max_minutes, crew_filter, is_hard)
    
    for rule in solver.role_rules:
        role_id = rule['roleId']
        crew_filter = rule.get('crewId')
        is_hard = rule['constraintType'] == 'HARD'
        
        if rule['type'] == 'MIN_BLOCKSIZE':
            min_rules[role_id] = (rule['valueInt'], crew_filter, is_hard)
        elif rule['type'] == 'MAX_BLOCKSIZE':
            max_rules[role_id] = (rule['valueInt'], crew_filter, is_hard)
    
    for role_id, (max_minutes, crew_filter, is_hard) in max_rules.items():
        role = solver.role_by_id.get(role_id)
        if not role:
            continue
        
        # Convert minutes to slots
        max_consecutive_slots = solver.time_grid.task_length_to_slots(max_minutes)
        task_slots = solver.time_grid.task_length_to_slots(role.get('taskLength', 30))
        
        for crew in solver.crew:
            crew_id = crew['id']
            if crew_filter and crew_id != crew_filter:
                continue
            
            shift_start = solver.time_grid.minutes_to_slot_floor(crew['shiftStartMin'])
            shift_end = solver.time_grid.minutes_to_slot_floor(crew['shiftEndMin'])
            
            # Forbid exceeding max_consecutive_slots
            # Check windows of (max_consecutive_slots + 1) slots
            forbidden_window = max_consecutive_slots + 1
            
            for s in range(shift_start, shift_end - forbidden_window + 1):
                # Get all assignments that would cover this extended window
                window_vars = []
                
                for (var_crew, var_slot, var_role, var_task_slots), var in solver.assignment_vars.items():
                    if var_crew != crew_id or var_role != role_id:
                        continue
                    # Does this assignment overlap with [s, s + forbidden_window)?
                    if var_slot < s + forbidden_window and var_slot + var_task_slots > s:
                        window_vars.append((var_slot, var_task_slots, var))
                
                if not window_vars:
                    continue
                
                # Build coverage for each slot in the window
                slot_covered = []
                for slot_offset in range(forbidden_window):
                    slot = s + slot_offset
                    covering = [
                        var for (var_slot, var_ts, var) in window_vars
                        if var_slot <= slot < var_slot + var_ts
                    ]
                    if covering:
                        cov_var = solver.model.NewBoolVar(f'cov_{crew_id}_{s}_{slot_offset}_{role_id}')
                        solver.model.AddMaxEquality(cov_var, covering)
                        slot_covered.append(cov_var)
                
                
                # Can't have all slots in forbidden_window covered
                if len(slot_covered) == forbidden_window:
                    if is_hard:
                        solver.model.Add(sum(slot_covered) <= max_consecutive_slots)
                    else:
                        excess = solver.model.NewBoolVar(f'max_block_viol_{crew_id}_{s}_{role_id}')
                        solver.model.Add(sum(slot_covered) <= max_consecutive_slots + (forbidden_window * excess))
                        solver.soft_violations.append(-300 * excess)
```

**Difference: `Role.taskLength` vs Blocksize Rules:**

| Aspect | Role `taskLength` | `MIN/MAX_BLOCKSIZE` RoleRule |
|--------|-------------------|------------------------------|
| Controls | Size of 1 assignment variable | Max consecutive time on role |
| Unit | Minutes | Minutes |
| Scope | All crew at store | Store-wide OR per-crew |
| Example | REGISTER=60min | MIN=60, MAX=60 → exactly 1hr stints |

**Example:** REGISTER has `taskLength: 60`. With `MAX_BLOCKSIZE: 60`, crew can only do 1-hour register stints - no back-to-back 2-hour blocks. They must do something else before getting back on register.

### DISTRIBUTION_BETWEEN_ROLE_X - Detailed Spec

This rule rewards/penalizes the distribution of time between two **role families** (not individual roles).

**How it works:**
- `roleId` → The "source" role family (e.g., REGISTER family)
- `targetRoleId` → The "target" role family (e.g., PRODUCT family)
- `valueInt` → Bias direction:
  - `-1` = Favor source family (more REGISTER than PRODUCT)
  - `0` = Balanced (equal time on both families)
  - `+1` = Favor target family (more PRODUCT than REGISTER)

**Family-based counting:**
The solver counts ALL roles within each family, not just the specific role.
- PRODUCT family includes: PRODUCT, ART, ORDER_WRITER, DEMO, WINE_DEMO, etc.
- REGISTER family includes: REGISTER (typically just one role)

**Solver implementation:**
```python
def _distribution_preference(solver, rule):
    """Reward/penalize distribution between two role families."""
    source_family_id = rule['roleFamilyId']
    target_family_id = rule['targetRoleFamilyId']
    bias = rule['valueInt']  # -1, 0, or 1
    weight = 100
    
    # Build role sets for each family
    source_roles = [r for r in solver.roles if solver.role_family_map.get(r) == source_family_id]
    target_roles = [r for r in solver.roles if solver.role_family_map.get(r) == target_family_id]
    
    for crew_id in solver.crew_ids:
        crew = solver.crew_by_id[crew_id]
        shift_start = crew['shiftStartMin'] // solver.slot_minutes
        shift_end = crew['shiftEndMin'] // solver.slot_minutes
        max_slots = shift_end - shift_start
        
        # Sum slots for source family (all roles in family)
        source_slots = []
        for role in source_roles:
            source_slots.extend([
                solver.x[(crew_id, s, role)]
                for s in range(shift_start, shift_end)
                if (crew_id, s, role) in solver.x
            ])
        
        # Sum slots for target family (all roles in family)
        target_slots = []
        for role in target_roles:
            target_slots.extend([
                solver.x[(crew_id, s, role)]
                for s in range(shift_start, shift_end)
                if (crew_id, s, role) in solver.x
            ])
        
        if not source_slots or not target_slots:
            continue
        
        sum_source = sum(source_slots)
        sum_target = sum(target_slots)
        
        if bias == 0:
            # Balanced: minimize |sum_source - sum_target|
            diff = solver.model.NewIntVar(-max_slots, max_slots, f'dist_diff_{crew_id}')
            solver.model.Add(diff == sum_source - sum_target)
            abs_diff = solver.model.NewIntVar(0, max_slots, f'dist_abs_{crew_id}')
            solver.model.AddAbsEquality(abs_diff, diff)
            solver.objective_terms.append(-weight * abs_diff)
        elif bias == -1:
            # Favor source family: reward sum_source - sum_target
            solver.objective_terms.append(weight * (sum_source - sum_target))
        else:  # bias == 1
            # Favor target family: reward sum_target - sum_source
            solver.objective_terms.append(weight * (sum_target - sum_source))
```

**Data requirements for solver input:**
```typescript
interface RoleRuleInput {
  // ... existing fields ...
  roleFamilyId?: number;       // Family ID for source role
  targetRoleFamilyId?: number; // Family ID for target role
}

// Also need to pass role -> family mapping
interface SolverInput {
  // ... existing fields ...
  roleFamilyMap: Record<string, number>;  // roleCode -> familyId
}
```

---

## Implementation Steps

### Phase 1: Fix Schema Issues & Migrate

**1.1 Fix `CrewRoleRule` model (missing `@id` and relations)**
```prisma
model CrewRoleRule {
  id         Int      @id @default(autoincrement())
  crewId     String   @db.Char(7)
  roleRuleId Int
  isPriority Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  Crew       Crew     @relation(fields: [crewId], references: [id])
  RoleRule   RoleRule @relation(fields: [roleRuleId], references: [id])

  @@unique([crewId, roleRuleId])
  @@index([crewId])
}
```

**1.2 Fix `StoreRoleRule` model (missing `@id` and relations)**
```prisma
model StoreRoleRule {
  id         Int      @id @default(autoincrement())
  storeId    Int
  roleRuleId Int
  isPriority Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  Store      Store    @relation(fields: [storeId], references: [id])
  RoleRule   RoleRule @relation(fields: [roleRuleId], references: [id])

  @@unique([storeId, roleRuleId])
  @@index([storeId])
}
```

**1.3 Add relations to `RoleRule`**
```prisma
model RoleRule {
  // ... existing fields ...
  CrewRoleRules  CrewRoleRule[]
  StoreRoleRules StoreRoleRule[]
}
```

**1.4 Add relations to `Crew` and `Store`**
```prisma
model Crew {
  // ... existing relations ...
  CrewRoleRule CrewRoleRule[]
}

model Store {
  // ... existing relations ...
  StoreRoleRule StoreRoleRule[]
}
```

**1.5 Fix duplicate enum value**
Remove duplicate `CANNOT_BE_ASSIGNED_AFTER` in `RoleRuleType`.

**1.6 Run migration**
```bash
cd apps/api && pnpm prisma migrate dev --name add_role_rules_complete
```

---

### Phase 2: API Layer

**2.1 Create RoleRule CRUD endpoints**
```
POST   /api/roles/:roleId/rules          - Create a rule for a role
GET    /api/roles/:roleId/rules          - List rules for a role
DELETE /api/roles/:roleId/rules/:ruleId  - Delete a rule
```

**2.2 Create StoreRoleRule endpoints (store adopts a rule)**
```
POST   /api/stores/:storeId/role-rules         - Adopt a RoleRule for store
GET    /api/stores/:storeId/role-rules         - List store's active rules
DELETE /api/stores/:storeId/role-rules/:id     - Remove rule from store
```

**2.3 Create CrewRoleRule endpoints (crew opt-in/override)**
```
POST   /api/crew/:crewId/role-rules            - Opt crew into a RoleRule
GET    /api/crew/:crewId/role-rules            - List crew's rule overrides
DELETE /api/crew/:crewId/role-rules/:id        - Remove crew override
```

---

### Phase 3: Solver Input Builder

**3.1 Fetch applicable rules in `buildSolverInput()`**

Location: `apps/api/src/routes/solver.ts`

```typescript
// Get all RoleRules for this store
const storeRoleRules = await prisma.storeRoleRule.findMany({
  where: { storeId },
  include: { RoleRule: { include: { Role: true, TargetRole: true } } }
});

// Get crew-level overrides
const crewRoleRules = await prisma.crewRoleRule.findMany({
  where: { crewId: { in: crewIds } },
  include: { RoleRule: { include: { Role: true, TargetRole: true } } }
});
```

**3.2 Transform to solver input format**

Add new field to `SolverInput`:
```typescript
interface RoleRuleInput {
  roleId: number;
  roleCode: string;
  type: RoleRuleType;
  targetRoleCode?: string;
  valueInt?: number;
  constraintType: 'HARD' | 'SOFT';
  scope: 'STORE' | 'CREW';
  crewId?: string;  // Only for CREW scope
}

interface SolverInput {
  // ... existing fields ...
  roleRules: RoleRuleInput[];
}
```

---

### Phase 4: Python Solver Implementation

**4.1 Parse roleRules in `core.py`**
```python
self.role_rules = data.get('roleRules', [])
```

**4.2 Add constraint handlers in `constraints.py`**

Create a new function for each rule type:

```python
def _apply_role_rules(solver: "LogbookSolver") -> None:
    """Apply all RoleRule constraints."""
    for rule in solver.role_rules:
        rule_type = rule['type']
        
        if rule_type == 'CANNOT_BE_ASSIGNED_BEFORE':
            _cannot_be_before(solver, rule)
        elif rule_type == 'MIN_GAP_BETWEEN_ASSIGNMENT':
            _min_gap_between(solver, rule)
        elif rule_type == 'FORBID_ROLE':
            _forbid_role(solver, rule)
        elif rule_type == 'MAX_CONSECUTIVE_MINUTES_ON_ROLE':
            _max_consecutive(solver, rule)
        # ... etc
```

**4.3 Implement each constraint handler**

Example - `CANNOT_BE_ASSIGNED_BEFORE`:
```python
def _cannot_be_before(solver, rule):
    """Role X cannot appear before targetRole Y in a crew's shift."""
    role = rule['roleCode']
    target_role = rule['targetRoleCode']
    is_hard = rule['constraintType'] == 'HARD'
    crew_filter = rule.get('crewId')  # None = all crew
    
    for crew_id in solver.crew_ids:
        if crew_filter and crew_id != crew_filter:
            continue
        
        crew = solver.crew_by_id[crew_id]
        shift_start = crew['shiftStartMin'] // solver.slot_minutes
        shift_end = crew['shiftEndMin'] // solver.slot_minutes
        
        # For each slot where role is assigned, target_role must not appear later
        for s1 in range(shift_start, shift_end):
            key1 = (crew_id, s1, role)
            if key1 not in solver.x:
                continue
            
            for s2 in range(s1 + 1, shift_end):
                key2 = (crew_id, s2, target_role)
                if key2 not in solver.x:
                    continue
                
                # If role assigned at s1, target_role cannot be at s2 (later)
                if is_hard:
                    solver.model.Add(solver.x[key1] + solver.x[key2] <= 1)
                else:
                    # Soft: add penalty via objective
                    violation = solver.model.NewBoolVar(f'before_viol_{crew_id}_{s1}_{s2}')
                    solver.model.Add(violation >= solver.x[key1] + solver.x[key2] - 1)
                    solver.soft_violations.append(-100 * violation)
```

**4.4 Call `_apply_role_rules()` in `add_all_constraints()`**

---

### Phase 5: Testing

**5.1 Unit tests for each RoleRuleType**

Create: `apps/solver-python/tests/test_role_rules.py`

Test cases:
- CANNOT_BE_ASSIGNED_BEFORE works (REGISTER cannot come before PARKING_HELM)
- MIN_BLOCKSIZE enforces minimum consecutive slots
- MAX_BLOCKSIZE caps maximum consecutive slots
- FORBID_ROLE removes all variables for crew
- MAX_CONSECUTIVE_MINUTES limits block length
- ALLOW_HALF_BLOCKSIZE relaxes blockSize constraint
- DISTRIBUTION_BETWEEN_ROLE_X with bias=0 balances families
- DISTRIBUTION_BETWEEN_ROLE_X with bias=-1 favors source family
- DISTRIBUTION_BETWEEN_ROLE_X with bias=+1 favors target family

**5.2 Integration test**

Create: `apps/api/test/role-rules.test.ts`

- Create RoleRule via API
- Attach to Store
- Run solver
- Verify constraint is respected in output

---

### Phase 6: UI (Future)

**6.1 Store Settings Page**
- List active RoleRules
- Toggle on/off per store
- Set constraint type (HARD/SOFT)

**6.2 Crew Profile Page**
- Show inherited rules from store
- Allow opt-in/opt-out overrides
- Set isPriority flag

---

## Example Usage

### Example 1: PARKING_HELM cannot be assigned before REGISTER
```sql
INSERT INTO "RoleRule" (roleId, type, targetRoleId, constraintType)
VALUES (
  (SELECT id FROM "Role" WHERE code = 'PARKING_HELM'),
  'CANNOT_BE_ASSIGNED_BEFORE',
  (SELECT id FROM "Role" WHERE code = 'REGISTER'),
  'HARD'
);
```

### Example 2: Max 2 hours consecutive on REGISTER
```sql
INSERT INTO "RoleRule" (roleId, type, valueInt, constraintType)
VALUES (
  (SELECT id FROM "Role" WHERE code = 'REGISTER'),
  'MAX_CONSECUTIVE_MINUTES_ON_ROLE',
  120,
  'SOFT'
);
```

### Example 3: Allow crew to use 30-min blocks on REGISTER
```sql
-- First create the rule
INSERT INTO "RoleRule" (roleId, type, constraintType)
VALUES (
  (SELECT id FROM "Role" WHERE code = 'REGISTER'),
  'ALLOW_HALF_BLOCKSIZE',
  'HARD'
);

-- Then assign to specific crew
INSERT INTO "CrewRoleRule" (crewId, roleRuleId, isPriority)
VALUES ('ABC1234', 1, true);
```

### Example 4: Balance REGISTER vs PRODUCT family time
```sql
-- Crew prefers equal time on REGISTER family vs PRODUCT family
INSERT INTO "RoleRule" (roleId, type, targetRoleId, valueInt, constraintType)
VALUES (
  (SELECT id FROM "Role" WHERE code = 'REGISTER'),  -- source family
  'DISTRIBUTION_BETWEEN_ROLE_X',
  (SELECT id FROM "Role" WHERE code = 'PRODUCT'),   -- target family
  0,   -- 0 = balanced
  'SOFT'
);
```

### Example 5: Crew prefers more PRODUCT than REGISTER
```sql
INSERT INTO "RoleRule" (roleId, type, targetRoleId, valueInt, constraintType)
VALUES (
  (SELECT id FROM "Role" WHERE code = 'REGISTER'),
  'DISTRIBUTION_BETWEEN_ROLE_X',
  (SELECT id FROM "Role" WHERE code = 'PRODUCT'),
  1,   -- +1 = favor target (PRODUCT family)
  'SOFT'
);

-- Assign to crew who wants more product time
INSERT INTO "CrewRoleRule" (crewId, roleRuleId, isPriority)
VALUES ('XYZ5678', 2, false);
```

---

## Priority Order

When multiple rules conflict:
1. **Crew-level rules with `isPriority=true`** override everything
2. **Crew-level rules** override store-level
3. **Store-level rules with `isPriority=true`** override other store rules
4. **Store-level rules** are the default

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/api/prisma/schema.prisma` | Fix models, add relations |
| `packages/shared-types/src/solver.ts` | Add `RoleRuleInput` type |
| `apps/api/src/routes/solver.ts` | Fetch rules in `buildSolverInput()` |
| `apps/api/src/routes/role-rules.ts` | New CRUD routes |
| `apps/solver-python/logbook_solver/core.py` | Parse `roleRules` |
| `apps/solver-python/logbook_solver/constraints.py` | Add `_apply_role_rules()` |
| `apps/solver-python/logbook_solver/objective.py` | Handle SOFT rule penalties |
