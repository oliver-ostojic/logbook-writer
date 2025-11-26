# Constraint System

Modular constraint validators and scorers for the logbook scheduling solver.

## Architecture

```
packages/domain/src/constraints/
  ├── types.ts                    # Shared types for constraints
  ├── validators/                 # Hard constraint validators
  │   ├── slotAlignment.ts        # ✅ Validates slot boundary alignment
  │   ├── storeHours.ts           # ✅ Validates store operating hours
  │   ├── roleSlotDuration.ts     # ✅ Validates role min/max slot duration
  │   ├── consecutiveSlots.ts     # ✅ Validates consecutive slot requirements
  │   └── hourlyCoverage.ts       # ✅ Validates UNIVERSAL role hourly staffing
  ├── scorers/                    # Soft constraint scorers (coming soon)
  └── index.ts                    # Public API
```

## Design Principles

1. **Modular**: Each constraint is an independent, testable function
2. **Composable**: Validators combine to form the full solver
3. **Type-safe**: Strong TypeScript types for all inputs/outputs
4. **Tested**: Each validator has comprehensive unit tests

## Usage

### In Tests

```typescript
import { validateSlotAlignment } from '@logbook-writer/domain/constraints';

const result = validateSlotAlignment(assignment, store);
if (!result.valid) {
  console.log('Violations:', result.violations);
}
```

### In Solver

```typescript
import * as Validators from '@logbook-writer/domain/constraints';

function validateAssignment(assignment, store, role, crew) {
  // Check all hard constraints
  const slotCheck = Validators.validateSlotAlignment(assignment, store);
  if (!slotCheck.valid) return { feasible: false, reason: slotCheck.violations };
  
  const hoursCheck = Validators.validateStoreHours(assignment, store, role);
  if (!hoursCheck.valid) return { feasible: false, reason: hoursCheck.violations };
  
  // ... more validators
  
  return { feasible: true };
}
```

## Implemented Constraints

### ✅ Slot Alignment (Store.baseSlotMinutes)

**File**: `validators/slotAlignment.ts`

**Purpose**: Ensures all assignments start and end on slot boundaries

**Example**: With 30-minute slots, valid times are 8:00, 8:30, 9:00 but NOT 8:15

**Tests**: 11 test cases covering:
- Valid aligned assignments
- Misaligned start times
- Misaligned end times  
- Different slot sizes (15min, 30min, 60min)
- Real-world scenarios (register, demo, order writer shifts)

**Helper functions**:
- `minutesToSlotIndex()` - Convert time to slot number
- `slotIndexToMinutes()` - Convert slot number to time
- `calculateSlotsForAssignment()` - Get duration in slots

### ✅ Store Hours (Store.openMinutesFromMidnight, closeMinutesFromMidnight)

**File**: `validators/storeHours.ts`

**Purpose**: Ensures assignments respect store operating hours based on role permissions

**Rules**:
- If `role.allowOutsideStoreHours = false`: assignment MUST be within store hours
- If `role.allowOutsideStoreHours = true`: assignment CAN extend outside store hours

**Example**: 
- Store: 8 AM - 9 PM
- Register (regular role): ✓ 8 AM-5 PM, ✗ 7 AM-3 PM
- Setup (special role): ✓ 7 AM-3 PM (allowed to start early)

**Tests**: 19 test cases covering:
- Regular roles within store hours
- Regular roles violating store hours (early start, late end, both)
- Special roles allowed outside hours
- Edge cases at exact boundaries
- Time formatting and helper functions

**Helper functions**:
- `formatMinutesToTime()` - Convert minutes to readable time (e.g., "8:00 AM")
- `isWithinStoreHours()` - Quick check if assignment is within hours

### ✅ Role Slot Duration (Role.minSlots, maxSlots, blockSize)

**File**: `validators/roleSlotDuration.ts`

**Purpose**: Ensures assignment duration respects role-specific min/max slot constraints and block size requirements

**Rules**:
- Assignment duration (in slots) >= `role.minSlots`
- Assignment duration (in slots) <= `role.maxSlots`
- Assignment duration (in slots) must be a multiple of `role.blockSize`

**Example** (with 30min slots):
- Register (minSlots=2, maxSlots=16, blockSize=2): ✓ 1hr, 2hr, 3hr (2, 4, 6 slots) | ✗ 1.5hr (3 slots - not multiple of blockSize=2)
- Order Writer (minSlots=2, maxSlots=4, blockSize=1): ✓ 1-2 hours | ✗ 3 hours
- Demo (minSlots=8, maxSlots=16, blockSize=1): ✓ 4-8 hours | ✗ 3 hours

**Tests**: 32 test cases covering:
- Register role (1-8 hour shifts)
- Order Writer role (1-2 hour shifts)
- Demo role (4-8 hour shifts)
- Minimum and maximum boundaries
- Different slot sizes (15min, 30min, 60min)
- **Block size enforcement**:
  - blockSize=2 (1 hour increments): ✓ 2,4,6,8 slots | ✗ 3,5,7 slots
  - blockSize=4 (2 hour increments): ✓ 4,8,12 slots | ✗ 6 slots
  - blockSize=1 (default): any slot count allowed
- Helper functions

**Helper functions**:
- `isWithinSlotBounds()` - Quick boolean check if duration is valid
- `getAllowedDurationRange()` - Get min/max hours and slots for a role

### ✅ Consecutive Slots (Role.slotsMustBeConsecutive)

**File**: `validators/consecutiveSlots.ts`

**Purpose**: Enforces that when a role requires consecutive slots, assignments cannot have gaps

**Rules**:
- When `role.slotsMustBeConsecutive = true`: All assignments for the same crew+role must form ONE continuous block
- When `role.slotsMustBeConsecutive = false`: Assignments can be split with gaps (allowed)

**Example**:
- Register (slotsMustBeConsecutive=true): ✓ 9:00-12:00 (one block), ✗ 9:00-10:00 + 11:00-12:00 (gap)
- Order Writer (slotsMustBeConsecutive=false): ✓ 9:00-10:00 + 2:00-3:00 (split allowed)

**Tests**: 21 test cases covering:
- Single assignment validation (always passes)
- Multiple assignments with slotsMustBeConsecutive=false (splits allowed)
- Multiple assignments with slotsMustBeConsecutive=true:
  - Empty array (valid)
  - Single assignment (valid)
  - Perfectly adjacent assignments (valid)
  - 1-slot gap (invalid)
  - 2-slot gap (invalid)
  - Large gaps (invalid)
  - Unsorted input handling
  - Overlapping assignments (invalid)
  - Three consecutive assignments (valid)
  - Three assignments with middle gap (invalid)
- Helper function `canMergeIntoConsecutiveBlock()`

**Functions**:
- `validateConsecutiveSlots()` - Validates single assignment (basic check)
- `validateConsecutiveSlotsForCrewRole()` - **Main validator** for multiple assignments
- `canMergeIntoConsecutiveBlock()` - Helper to check if assignments can merge without gaps

### ✅ Hourly Coverage (HourlyRoleConstraint.requiredPerHour)

**File**: `validators/hourlyCoverage.ts`

**Purpose**: Validates that UNIVERSAL role assignments meet exact hourly staffing requirements

**Rules**:
- For each hour with a requirement, count unique crew members assigned
- The count must exactly equal `requiredPerHour` (not less, not more)
- A crew member counts if their assignment overlaps the hour at all

**Example** - Register with varying hourly needs:
- 8 AM: requires 7 crew → must have exactly 7 crew assigned during 8-9 AM
- 12 PM: requires 14 crew → must have exactly 14 crew assigned during 12-1 PM
- 8 PM: requires 5 crew → must have exactly 5 crew assigned during 8-9 PM

**Tests**: 17 test cases covering:
- Exact coverage match (valid)
- Understaffing (invalid - too few crew)
- Overstaffing (invalid - too many crew)
- Multiple hours with different requirements
- Multiple violations across hours
- Zero requirement handling
- Partial hour coverage (crew working 8:15-9:00 counts for 8 AM hour)
- Assignments spanning multiple hours
- Same crew not double-counted if they have multiple assignments
- Helper functions for counting and reporting

**Functions**:
- `validateHourlyCoverage()` - **Main validator** for hourly requirements
- `countCrewDuringHour()` - Count unique crew working during specific hour
- `getCoverageByHour()` - Get summary of actual vs required for all hours

## Coming Next

See the todo list for the full roadmap. Next up:

- [ ] Window role constraints validation (WindowRoleConstraint - COVERAGE_WINDOW model)
- [ ] Daily role constraints validation (DailyRoleConstraint - CREW_SPECIFIC model)
- [ ] Break policy validation
- And 16 more constraints...

## Test Results

```
✓ test/constraints/slotAlignment.test.ts (11 tests)
✓ test/constraints/storeHours.test.ts (19 tests)
✓ test/constraints/roleSlotDuration.test.ts (32 tests)
✓ test/constraints/consecutiveSlots.test.ts (21 tests)
✓ test/constraints/hourlyCoverage.test.ts (17 tests) ← NEW
✓ test/constraints/integration.test.ts (13 tests)

Total: 113 constraint tests passing
Overall: 124 tests passing
```

## Development Pattern

Each new constraint follows this pattern:

1. **Create validator** in `src/constraints/validators/[name].ts`
2. **Write unit tests** in `test/constraints/[name].test.ts`
3. **Add integration test** in `test/constraints/integration.test.ts`
4. **Export** from `src/constraints/index.ts`
5. **Run tests**: `pnpm --filter @logbook-writer/domain test`

This ensures every constraint is:
- Independently tested
- Documented with examples
- Ready for integration
- Verified to work with real-world data
