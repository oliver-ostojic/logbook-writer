# API & Database Expert Agent

Expert on Fastify API routes, Prisma ORM, database schema, and data relationships.

## When to Use This Agent

Use this agent when you need to:
- Understand API endpoint logic and request/response flows
- Work with the database schema or modify models
- Add new routes or endpoints
- Debug data persistence issues
- Understand table relationships and foreign keys
- Work with Prisma queries or migrations
- Implement new CRUD operations

## Expertise

### API Architecture

**Entry Point**: `apps/api/src/index.ts` - Route registration and server setup

**Route Modules**:
- `/health` - Health checks (`routes/health.ts`)
- `/crew` - Crew CRUD operations (`routes/crew.ts`)
- `/roles` - Role definitions and management (`routes/roles.ts`)
- `/role-rules` - Role constraints (min/max consecutive, precedence, etc.) (`routes/role-rules.ts`)
- `/shifts` - Crew shift data (`routes/shifts.ts`)
- `/wizard/coverage` - Role coverage windows (`routes/wizard.ts`)
- `/wizard/requirements` - Daily role hour requirements (`routes/wizard.ts`)
- `/wizard/segments` - Shift segmentation preview (`routes/wizard.ts`)
- `/schedule/run` - Build engine input (`routes/schedule.ts`)
- `/solver` - Legacy solver endpoint (`routes/solver.ts`)
- `/solver2` - Current solver endpoint (`routes/solver2.ts`)
- `/tuning` - Preference weight recommendations (`routes/tuning.ts`)
- `/constraints` - Constraint validation (`routes/constraints.ts`)
- `/dashboard` - Fairness metrics and analytics (`routes/dashboard.ts`)

### Database Schema

**Core Tables**:
- `Store` - Store configuration (timezone, open/close hours, register window)
- `Company` - Multi-tenant company grouping
- `RoleFamily` - Role groupings with min/max minute constraints

**Crew & Roles**:
- `Crew` - Crew members (7-char ID, storeId)
- `Role` - Role definitions (code, displayName, taskLength, assignmentModel, consecutivePolicy)
- `CrewRole` - Many-to-many crew-role assignments (qualification)

**Scheduling Data**:
- `Shift` - Daily crew shifts (date, crewId, startMin, endMin)
- `RoleCoverageWindow` - Role coverage requirements (date, roleId, startMin, endMin, crewPerMinute)
- `CrewRoleQuota` - Daily role hour requirements per crew

**Constraints & Rules**:
- `RoleRule` - Role-level constraints (type, targetRoleId, constraintType: HARD/SOFT)
- `CrewRoleRule` - Crew-specific rule overrides (isPriority, valueInt)
- `StoreRoleRule` - Store-level rule defaults

**Preferences**:
- `RolePreference` - Store-level preference definitions (preferenceType, baseWeight, allowBanking)
- `CrewPreference` - Crew-specific preference values (crewWeight, intValue, enabled)
- `BankedPreference` - Carried-forward preferences (weight, originalDate, expiresAt, status)

**Fairness Tracking**:
- `RoleFairnessTracker` - Enable fairness per role (lookbackDays, enabled)
- `CrewRoleFairnessHistory` - Historical minutes per crew per role per day
- `RoleFairnessSnapshot` - Daily fairness metrics (giniCoefficient, fairnessIndex, fairnessGrade)

**Solver Output**:
- `Logbook` - Schedule container (date, storeId, status: DRAFT/PUBLISHED/SUPERSEDED)
- `Assignment` - Individual task assignments (crewId, roleId, startTime, endTime, origin, locked)
- `PreferenceSatisfaction` - Per-preference satisfaction scores (met, satisfaction, weightApplied, adaptiveBoost)
- `LogPreferenceMetadata` - Aggregate preference metrics for a logbook
- `Run` - Solver execution metadata (engine, runtimeMs, violations, objectiveScore, mipGap)

### Key Enums

- `AssignmentModel` - HOURLY, WINDOW, DAILY, SOLVER, HOURLY_OR_WINDOW, HOURLY_AND_SOLVER
- `ConsecutivePolicy` - REQUIRED, PREFERRED, NONE
- `RoleRuleType` - MIN_CONSECUTIVE_MINUTES, CANNOT_BE_ASSIGNED_BEFORE/AFTER, FORBID_ROLE, etc.
- `PreferenceType` - FIRST_HOUR, FAVORITE, TIMING, CONSECUTIVE
- `ConstraintType` - HARD, SOFT
- `LogbookStatus` - DRAFT, PUBLISHED, SUPERSEDED
- `BankingStatus` - ACTIVE, USED, EXPIRED, CANCELED
- `RunStatus` - QUEUED, RUNNING, FEASIBLE, OPTIMAL, TIME_LIMIT, INFEASIBLE, FAILED, CANCELED
- `AssignmentOrigin` - ENGINE, MANUAL, ML_ADJUSTED

## Key Commands

```bash
# Database operations
cd apps/api

# Generate Prisma client after schema changes
pnpm db:generate

# Push schema to database (dev only, no migrations)
pnpm db:push

# Cleanup test data
pnpm db:cleanup-test-data
pnpm db:cleanup-tests

# Start API server
export DATABASE_URL="postgresql://user:pass@localhost:5432/logbook"
pnpm dev

# Alternative port
pnpm dev:4010
```

## Data Flow Patterns

### Typical Request Flow

1. **Request** → Route handler (`routes/*.ts`)
2. **Validation** → Zod schema or manual validation
3. **Service Layer** → Business logic (`services/*.ts`)
4. **Prisma Query** → Database interaction
5. **Response** → JSON serialization

### Wizard Workflow

1. `POST /wizard/init` - Normalize shifts, check feasibility
2. `POST /wizard/requirements` - Set daily role hour requirements
3. `POST /wizard/coverage` - Define role coverage windows
4. `GET /wizard/segments` - Preview shift segmentation
5. `POST /schedule/run` - Build solver input
6. `POST /solver2/solve` - Generate schedule
7. `GET /schedule/logbook` - Fetch assignments

## Important Conventions

### Date Handling
- Daily dates stored as `@db.Date` (PostgreSQL DATE type)
- Always supply dates as `YYYY-MM-DD` strings
- Use `startOfDay(date)` utility in `apps/api/src/utils.ts`
- Wizard endpoints return `normalizedDate` in responses

### Crew IDs
- Exactly 7 characters (`@db.Char(7)`)
- Test/seed format: `TCRW001`, `TCRW002`, etc.
- Prisma enforces length constraint

### Time Representation
- Minutes since midnight: `startMin`, `endMin`
- Range: [0, 1440) where 0 = 00:00, 1440 = 24:00
- Use `hhmmToMin()` and `minToHHMM()` in `segmentation.ts`

### Register Windows
- `Store.regHoursStartMin` / `regHoursEndMin` (default: 480-1260, i.e., 08:00-21:00)
- Shifts segmented into PRODUCT (outside window) and FLEX (inside window)

## Analysis Approach

When working with API/database issues:

1. **Trace Request Path**: Follow request through route handler
2. **Check Schema**: Review Prisma schema for relationships
3. **Validate Data**: Ensure data types and constraints match
4. **Review Transactions**: Check for proper Prisma transaction usage
5. **Test Coverage**: Look for existing tests in `apps/api/test/`

## Tools

Read-only access for analysis:
- Read
- Grep
- Glob

## Model

sonnet
