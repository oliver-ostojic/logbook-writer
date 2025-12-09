# Constraints & Minutes Refactor Plan

## Goal
Simplify the constraint system by:
1. **Merging constraint types**: `HourlyRoleConstraint` + `WindowRoleConstraint` → `RoleCoverageWindow`
2. **Renaming for clarity**: `DailyRoleConstraint` → `CrewRoleQuota`
3. **Converting everything to minutes** - no more slots/blocks/hours confusion
4. **Adding RoleFamily** - group related roles (PRODUCT, SL, ART) for aggregate time limits

---

## New Schema Models

### `RoleFamily` (NEW)
Groups related roles for aggregate time constraints per crew.

```prisma
model RoleFamily {
  id         Int     @id @default(autoincrement())
  name       String  @unique   // e.g., "PRODUCT_TIME", "REGISTER_TIME"
  
  // Range of acceptable time for the solver to grant to the role family per crew
  minMinutes Int     // minimum total across all roles in family
  maxMinutes Int     // maximum total across all roles in family

  companyId  Int
  company    Company @relation(fields: [companyId], references: [id])
  roles      Role[]
}
```

**Example families:**
| Family | Roles | minMinutes | maxMinutes |
|--------|-------|------------|------------|
| PRODUCT_TIME | PRODUCT, PRODUCT_GAP, SL, ART | 60 | 150 |
| REGISTER_TIME | REGISTER, REGISTER_GAP | 60 | 120 |
| BREAK_TIME | BREAK | 30 | 30 |

### `RoleCoverageWindow` (replaces HourlyRoleConstraint + WindowRoleConstraint)
Specifies coverage requirements for a **specific role** within a time window.

```prisma
model RoleCoverageWindow {
  id                Int      @id @default(autoincrement())
  date              DateTime
  startMin          Int      // minutes from midnight (480 = 8am)
  endMin            Int      // minutes from midnight (540 = 9am)
  crewPerTaskLength Int      @default(1)  // crew needed per taskLength

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  storeId           Int
  roleId            Int      // targets specific role, NOT family
  role              Role     @relation(fields: [roleId], references: [id])
  store             Store    @relation(fields: [storeId], references: [id])

  @@unique([storeId, roleId, date, startMin, endMin])
  @@index([storeId, date])
}
```

**How old constraints map:**
| Old | New |
|-----|-----|
| `HourlyRoleConstraint { hour: 8, requiredPerHour: 7 }` | `RoleCoverageWindow { startMin: 480, endMin: 540, crewPerTaskLength: 7 }` |
| `WindowRoleConstraint { startHour: 9, endHour: 21, requiredPerHour: 1 }` | `RoleCoverageWindow { startMin: 540, endMin: 1260, crewPerTaskLength: 1 }` |

### `CrewRoleQuota` (replaces DailyRoleConstraint)
Specifies that a specific crew must work X minutes on a specific role.

```prisma
model CrewRoleQuota {
  id            Int      @id @default(autoincrement())
  date          DateTime
  startMin      Int      // constrain to time window
  endMin        Int      // constrain to time window  
  requiredMin   Int      // minutes required (was requiredHours as Float)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  storeId       Int
  crewId        String   @db.Char(7)
  roleId        Int
  crew          Crew     @relation(fields: [crewId], references: [id])
  role          Role     @relation(fields: [roleId], references: [id])
  store         Store    @relation(fields: [storeId], references: [id])

  @@unique([storeId, date, crewId, roleId])
  @@index([storeId, date])
}
```

**How old constraints map:**
| Old | New |
|-----|-----|
| `DailyRoleConstraint { requiredHours: 1.5 }` | `CrewRoleQuota { requiredMin: 90 }` |

---

## Role Model Updates

### Before
```prisma
model Role {
  minSlots      Int @default(1)
  maxSlots      Int @default(1)
  blockSize     Int @default(1)
  // ...
}
```

### After
```prisma
model Role {
  taskLength      Int          // assignment duration in minutes (e.g., 60 for 1-hour blocks)
  canSplitForGaps Boolean      @default(false) // can be split into smaller chunks to fill gaps
  displayCode     String       // what to show in UI (e.g., "PRODUCT" for both PRODUCT and PRODUCT_GAP)
  
  familyId        Int
  family          RoleFamily   @relation(fields: [familyId], references: [id])
  // minMinutes/maxMinutes now on RoleFamily
}
```

**Key changes**: 
- `minMinutes`/`maxMinutes` moved from `Role` to `RoleFamily` so limits apply across related roles.
- `canSplitForGaps` allows roles like PRODUCT (60 min) to split into 30-min chunks for gap-filling

### canSplitForGaps Explained

Some roles (PRODUCT, ART, SL) are **normally assigned in 1-hour blocks**, but can be **split into 30-min chunks to fill gaps** when needed.

| Role | taskLength | canSplitForGaps | Behavior |
|------|-----------|-----------------|----------|
| PRODUCT | 60 | true | 1-hour blocks, can split to 30 for gaps |
| ART | 60 | true | 1-hour blocks, can split to 30 for gaps |
| SL | 60 | true | 1-hour blocks, can split to 30 for gaps |
| REGISTER | 30 | false | Always 30-min chunks |
| BRK | 30 | false | Always 30-min chunks |

**Why this matters for preferences:**
- When a crew says "I don't want consecutive PRODUCT", they mean **alternate 1-hour blocks**
- WITHOUT this flag, if taskLength was 30, "non-consecutive" would scatter 30-min chunks everywhere
- WITH this flag, the solver knows PRODUCT is fundamentally a 1-hour role that can flex to 30 when needed

**Solver implementation:**
1. Primary pass: Assign using `taskLength` (60 min for PRODUCT)
2. Gap-filling pass: If gaps remain and `canSplitForGaps=true`, allow half-length assignments
3. Consecutive policy evaluates against `taskLength`, not the gap-fill size

---

## AssignmentModel Enum (UNCHANGED)

Keeping existing names to minimize refactoring:

```prisma
enum AssignmentModel {
  WINDOW  // Coverage window: "N crew per taskLength between A–B" (uses RoleCoverageWindow)
  DAILY   // Crew quota: "this crew must do X minutes" (uses CrewRoleQuota)
  SOLVER  // Solver-managed, no manager constraints (e.g., BREAK)
}
```

---

## Solver Implementation Plan

### Phase 1: Data Layer (TypeScript)

#### 1.1 Update `builder.ts` - Solver Input Construction

**Old structure:**
```typescript
{
  hourlyRequirements: [{ roleId, hour, required }],
  windowRequirements: [{ roleId, startHour, endHour, requiredPerHour }],
  dailyRequirements: [{ roleId, crewId, requiredMinutes }],
}
```

**New structure:**
```typescript
{
  roleFamilies: [{
    id: number,
    name: string,
    minMinutes: number,
    maxMinutes: number,
    roleIds: number[],  // roles in this family
  }],
  coverageWindows: [{
    roleId: number,
    startMin: number,
    endMin: number,
    crewPerTaskLength: number,
  }],
  crewQuotas: [{
    roleId: number,
    crewId: string,
    startMin: number,
    endMin: number,
    requiredMin: number,
  }],
}
```

#### 1.2 Update `types.ts`

```typescript
interface RoleFamilyDescriptor {
  id: number;
  name: string;
  minMinutes: number;
  maxMinutes: number;
  roleIds: number[];
}

interface RoleDescriptor {
  id: number;
  code: string;
  displayCode: string;      // for UI grouping
  displayName: string;
  assignmentModel: 'WINDOW' | 'DAILY' | 'SOLVER';
  taskLength: number;       // assignment duration in minutes
  familyId: number;
  consecutivePolicy: 'REQUIRED' | 'PREFERRED' | 'NONE';
  // ...
}

interface CoverageWindow {
  roleId: number;
  startMin: number;
  endMin: number;
  crewPerTaskLength: number;
}

interface CrewQuota {
  roleId: number;
  crewId: string;
  startMin: number;
  endMin: number;
  requiredMin: number;
}
```

### Phase 2: Python Solver

#### 2.1 Update `variables.py`

**Key changes:**
- Variables use `duration_minutes` (= `taskLength`) instead of `slot_count`
- Time window checks use minutes directly

```python
@dataclass
class AssignmentVariable:
    key: str
    role_id: int
    crew_id: str
    start_minute: int      # start time in minutes from midnight
    end_minute: int        # end time
    duration_minutes: int  # = end_minute - start_minute = taskLength
    family_id: int         # for family-level constraints
```

**Variable creation logic:**
```python
def build_assignment_variables(cp, solver_input, grid):
    for role in roles:
        task_length = role["taskLength"]
        
        for crew_id in eligible_crew:
            crew_window = grid.crew_windows[crew_id]
            
            # Generate variables at each valid start position
            for start_min in range(crew_window.start_min, crew_window.end_min, base_slot_minutes):
                end_min = start_min + task_length
                if end_min > crew_window.end_min:
                    continue
                    
                # For WINDOW roles, only create if there's a coverage window
                if role["assignmentModel"] == "WINDOW":
                    if not has_coverage_window_at(role["id"], start_min, end_min):
                        continue
                
                create_variable(role_id, crew_id, start_min, end_min, role["familyId"])
```

#### 2.2 Update `constraints.py`

**Remove:**
- `_build_hourly_constraints()`
- `_build_window_constraints()`
- `_build_daily_constraints()`

**Add:**
- `_build_coverage_constraints()`
- `_build_quota_constraints()`
- `_build_family_constraints()`

```python
def _build_coverage_constraints(model, solver_input, variable_bundle, grid):
    """Build coverage window constraints.
    
    For each coverage window, ensure crewPerTaskLength people are assigned
    at each taskLength position within the window.
    """
    for window in solver_input["coverageWindows"]:
        role_id = window["roleId"]
        start_min = window["startMin"]
        end_min = window["endMin"]
        crew_per_task = window["crewPerTaskLength"]
        
        role = role_lookup[role_id]
        task_length = role["taskLength"]
        
        # For each task position in the window
        for task_start in range(start_min, end_min, task_length):
            task_end = task_start + task_length
            if task_end > end_min:
                break
            
            # Get all variables that cover this task slot
            vars_at_task = get_variables_at(role_id, task_start, task_end)
            
            # Constraint: exactly crew_per_task assigned
            model.Add(sum(vars_at_task) == crew_per_task)


def _build_quota_constraints(model, solver_input, variable_bundle, grid):
    """Build crew quota constraints.
    
    Each crew must have at least requiredMin minutes of assignment.
    """
    for quota in solver_input["crewQuotas"]:
        role_id = quota["roleId"]
        crew_id = quota["crewId"]
        required_min = quota["requiredMin"]
        
        # Get all variables for this crew+role
        vars_for_crew = get_variables_for(role_id, crew_id)
        
        # Sum of (duration_minutes * var) >= required_min
        total_minutes = sum(var.duration_minutes * var.cp_var for var in vars_for_crew)
        model.Add(total_minutes >= required_min)


def _build_family_constraints(model, solver_input, variable_bundle, grid):
    """Build role family constraints.
    
    Each crew's total time across all roles in a family must be within
    [minMinutes, maxMinutes].
    """
    for family in solver_input["roleFamilies"]:
        family_id = family["id"]
        min_minutes = family["minMinutes"]
        max_minutes = family["maxMinutes"]
        
        for crew_id in all_crew:
            # Get all variables for this crew in this family
            vars_for_crew_family = get_variables_for_family(family_id, crew_id)
            
            if not vars_for_crew_family:
                continue
            
            # Sum of (duration_minutes * var)
            total_minutes = sum(var.duration_minutes * var.cp_var for var in vars_for_crew_family)
            
            # Constraint: min <= total <= max
            model.Add(total_minutes >= min_minutes)
            model.Add(total_minutes <= max_minutes)
```

#### 2.3 Update `time_grid.py`

Simplify to work purely in minutes:

```python
@dataclass
class CrewWindow:
    crew_id: str
    start_min: int  # shift start in minutes from midnight
    end_min: int    # shift end in minutes from midnight

@dataclass
class TimeGrid:
    store_open_min: int
    store_close_min: int
    base_slot_minutes: int  # for discretization only
    crew_windows: Dict[str, CrewWindow]
```

### Phase 3: Constraint Indexing

**New indexing strategy (by minute ranges and family):**

```python
def _index_variables_by_role_and_time(variable_bundle):
    """Index variables by role and time range for coverage constraints."""
    # role_id -> list of (start_min, end_min, var)
    by_role = defaultdict(list)
    # family_id -> crew_id -> list of vars
    by_family_crew = defaultdict(lambda: defaultdict(list))
    
    for var in variable_bundle.variables:
        by_role[var.role_id].append(var)
        by_family_crew[var.family_id][var.crew_id].append(var)
    
    return by_role, by_family_crew
```

---

## Migration Steps

### Step 1: Create new tables
```sql
CREATE TABLE "RoleFamily" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) UNIQUE NOT NULL,
  "minMinutes" INT NOT NULL,
  "maxMinutes" INT NOT NULL,
  "companyId" INT NOT NULL REFERENCES "Company"("id")
);

CREATE TABLE "RoleCoverageWindow" (...);
CREATE TABLE "CrewRoleQuota" (...);
```

### Step 2: Create role families and link roles
```sql
-- Create families
INSERT INTO "RoleFamily" (name, "minMinutes", "maxMinutes", "companyId") VALUES
  ('PRODUCT_TIME', 60, 150, 1),
  ('REGISTER_TIME', 60, 120, 1),
  ('BREAK_TIME', 30, 30, 1);

-- Add familyId to roles
ALTER TABLE "Role" ADD COLUMN "familyId" INT REFERENCES "RoleFamily"("id");
ALTER TABLE "Role" ADD COLUMN "displayCode" VARCHAR(255);
ALTER TABLE "Role" ADD COLUMN "taskLength" INT;

-- Populate
UPDATE "Role" SET 
  "familyId" = (SELECT id FROM "RoleFamily" WHERE name = 'PRODUCT_TIME'),
  "displayCode" = 'PRODUCT',
  "taskLength" = "blockSize" * 30
WHERE code IN ('PRODUCT', 'SL', 'ART');
```

### Step 3: Migrate constraint data
```sql
-- HourlyRoleConstraint -> RoleCoverageWindow
INSERT INTO "RoleCoverageWindow" (date, "startMin", "endMin", "crewPerTaskLength", "storeId", "roleId")
SELECT 
  date,
  hour * 60,
  (hour + 1) * 60,
  "requiredPerHour",
  "storeId",
  "roleId"
FROM "HourlyRoleConstraint";

-- WindowRoleConstraint -> RoleCoverageWindow  
INSERT INTO "RoleCoverageWindow" (date, "startMin", "endMin", "crewPerTaskLength", "storeId", "roleId")
SELECT 
  date,
  "startHour" * 60,
  "endHour" * 60,
  "requiredPerHour",
  "storeId",
  "roleId"
FROM "WindowRoleConstraint";

-- DailyRoleConstraint -> CrewRoleQuota
INSERT INTO "CrewRoleQuota" (date, "startMin", "endMin", "requiredMin", "storeId", "crewId", "roleId")
SELECT 
  date,
  0,    -- or shift start
  1440, -- or shift end
  CAST("requiredHours" * 60 AS INT),
  "storeId",
  "crewId",
  "roleId"
FROM "DailyRoleConstraint";
```

### Step 4: Update solver code to use new tables

### Step 5: Update API routes

### Step 6: Update frontend

### Step 7: Drop old tables and columns
```sql
DROP TABLE "HourlyRoleConstraint";
DROP TABLE "WindowRoleConstraint";
DROP TABLE "DailyRoleConstraint";

ALTER TABLE "Role" DROP COLUMN "minSlots";
ALTER TABLE "Role" DROP COLUMN "maxSlots";
ALTER TABLE "Role" DROP COLUMN "blockSize";
```

---

## Summary: Before vs After

| Before | After |
|--------|-------|
| 3 constraint tables | 2 constraint tables |
| No role grouping | `RoleFamily` for aggregate limits |
| slots, blocks, hours, minutes | **minutes only** |
| `minSlots: 1` (unclear) | `taskLength: 60` (clear) |
| `HourlyRoleConstraint` | `RoleCoverageWindow` |
| `WindowRoleConstraint` | `RoleCoverageWindow` |
| `DailyRoleConstraint` | `CrewRoleQuota` |
| `requiredPerHour` | `crewPerTaskLength` |
| `requiredHours: 1.5` (Float) | `requiredMin: 90` (Int) |
| Per-role min/max | Per-family min/max |

---

## Files to Modify

### TypeScript
- `apps/api/prisma/schema.prisma` ✅ DONE
- `apps/api/src/solver2/types.ts`
- `apps/api/src/solver2/builder.ts`
- `apps/api/src/routes/constraints.ts`
- `apps/api/src/routes/solver2.ts`
- `packages/shared-types/src/solver.ts`

### Python
- `apps/api/src/solver2/python/variables.py`
- `apps/api/src/solver2/python/constraints.py`
- `apps/api/src/solver2/python/time_grid.py`
- `apps/api/src/solver2/python/solver_v2.py`

### Frontend
- `apps/web/app/stores/[storeId]/logbook/create/constraints/*`

