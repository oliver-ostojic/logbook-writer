# Testing Expert Agent

Expert on test architecture, Vitest usage, test patterns, and quality assurance.

## When to Use This Agent

Use this agent when you need to:
- Write new tests or test suites
- Debug failing tests
- Understand test coverage gaps
- Review test patterns and best practices
- Work with Vitest configuration
- Test API endpoints or domain logic
- Create integration tests for the solver

## Expertise

### Test Framework

**Testing Stack**:
- **Vitest** - Fast unit test runner
- **Fastify.inject()** - API endpoint testing
- **Prisma Test Helpers** - Database cleanup and seeding

### Test Locations

**API Tests** (`apps/api/test/`):
- `crud.test.ts` - Role and crew CRUD operations
- `wizard.requirements.test.ts` - Daily role requirements endpoints
- `wizard.coverage.test.ts` - Coverage window endpoints
- `wizard.segments.test.ts` - Shift segmentation
- `wizard.demo.test.ts` - DEMO role coverage
- `solver.integration.test.ts` - Solver integration tests
- `e2e.api.test.ts` - End-to-end API workflows
- `preferences.test.ts` - Preference system tests
- `fairness-index.test.ts` - Fairness calculations
- `tuning.test.ts` - Auto-tuning endpoints
- `cleanup.integrity.test.ts` - Data cleanup verification
- `segmentation.test.ts` - Shift segmentation logic

**Domain Tests** (`packages/domain/test/`):
- `solver.test.ts` - Core solver logic
- `normalization.test.ts` - Date and data normalization
- `validation.test.ts` - Input validation
- `constraints/*.test.ts` - Individual constraint validators and scorers
  - `slotAlignment.test.ts`, `hourlyCoverage.test.ts`, `windowCoverage.test.ts`
  - `dailyHours.test.ts`, `breakPolicy.test.ts`, `crewQualification.test.ts`
  - `firstHour.test.ts`, `favorite.test.ts`, `timing.test.ts`, `consecutive.test.ts`
  - `bankedPreference.test.ts`, `adaptiveBoost.test.ts`, `fairnessAdjustment.test.ts`
- `constraints/integration-*.test.ts` - Integration test suites

**Solver Tests** (`apps/api/src/solver2/__tests__/`):
- `block-size-constraint-applier.test.ts`
- `block-size-constraints.test.ts`
- `builder.role-rules-precedence.test.ts`

### Test Commands

```bash
# Run all tests (from root or package)
pnpm test

# Run API tests
cd apps/api
pnpm test

# Run specific test file or pattern
cd apps/api
pnpm test crud
pnpm test wizard
pnpm test fairness
pnpm test solver

# Run domain tests
cd packages/domain
pnpm test
```

### Test Patterns

**API Endpoint Testing**:
```typescript
import { buildServer } from '../src/index';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Crew CRUD', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create crew member', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/crew',
      payload: {
        id: 'TCRW001',
        name: 'Test Crew',
        storeId: 768
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'TCRW001',
      name: 'Test Crew'
    });
  });
});
```

**Domain Constraint Testing**:
```typescript
import { validateSlotAlignment } from '../src/constraints/validators/slotAlignment';
import { describe, it, expect } from 'vitest';

describe('Slot Alignment Validator', () => {
  it('should pass when slots align with shift bounds', () => {
    const result = validateSlotAlignment({
      shift: { startMin: 480, endMin: 1020 },
      assignments: [
        { startMin: 480, endMin: 540 },
        { startMin: 540, endMin: 600 }
      ]
    });

    expect(result.valid).toBe(true);
  });

  it('should fail when assignment exceeds shift end', () => {
    const result = validateSlotAlignment({
      shift: { startMin: 480, endMin: 1020 },
      assignments: [
        { startMin: 1000, endMin: 1080 } // Exceeds shift end
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
```

**Integration Test Pattern**:
```typescript
describe('Solver Integration', () => {
  let testStoreId: number;
  let testCrewIds: string[];

  beforeAll(async () => {
    // Setup test data
    testStoreId = 999;
    await createTestStore(testStoreId);
    testCrewIds = await createTestCrew(testStoreId, 5);
    await createTestShifts(testStoreId, testCrewIds);
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestStore(testStoreId);
  });

  it('should generate feasible schedule', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/solver2/solve',
      payload: {
        storeId: testStoreId,
        date: '2025-01-06',
        timeLimitSeconds: 10
      }
    });

    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.status).toBe('OPTIMAL');
    expect(result.assignments.length).toBeGreaterThan(0);
  });
});
```

## Test Data Management

### Cleanup Helpers

**Test Store Cleanup**:
```bash
cd apps/api
pnpm db:cleanup-test-data
pnpm db:cleanup-tests
```

**In-Test Cleanup**:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupTestStore(storeId: number) {
  await prisma.assignment.deleteMany({ where: { Logbook: { storeId } } });
  await prisma.logbook.deleteMany({ where: { storeId } });
  await prisma.shift.deleteMany({ where: { storeId } });
  await prisma.crewRole.deleteMany({ where: { Crew: { storeId } } });
  await prisma.crew.deleteMany({ where: { storeId } });
  await prisma.role.deleteMany({ where: { storeId } });
  await prisma.store.delete({ where: { id: storeId } });
}
```

### Test Data Conventions

**Crew IDs**:
- Use 7-character format: `TCRW001`, `TCRW002`, etc.
- Prefix with `T` to indicate test data

**Store IDs**:
- Use high numbers (768, 999) to avoid conflicts
- Document which stores are for testing

**Dates**:
- Use consistent test dates: `2025-01-06`, `2025-01-07`
- Avoid current date to prevent flakiness

## Coverage Areas

### Well-Tested
- CRUD operations (crew, roles)
- Wizard endpoints (requirements, coverage, segments)
- Shift segmentation logic
- Constraint validators (slotAlignment, hourlyCoverage, breakPolicy)
- Preference scorers (firstHour, favorite, timing)
- Fairness index calculations

### Test Gaps (Opportunities)
- Python solver edge cases (infeasibility scenarios)
- Multi-day fairness tracking
- Preference banking expiration logic
- Dashboard chart data accuracy
- Role rule precedence with complex overrides
- Concurrent solver runs
- Large-scale performance (100+ crew)

## Best Practices

### Test Organization
- Group related tests with `describe` blocks
- Use descriptive test names that explain the scenario
- One assertion focus per test (but multiple expects OK)
- Separate unit tests from integration tests

### Test Data
- Always clean up after tests (use `afterAll` or `afterEach`)
- Use unique IDs to avoid conflicts between test runs
- Prefer small, focused test datasets
- Avoid relying on existing database state

### Assertions
- Use specific matchers: `toBe`, `toMatchObject`, `toHaveLength`
- Test both success and error paths
- Verify error messages and status codes
- Check boundary conditions

### Performance
- Keep unit tests fast (< 100ms each)
- Use parallel test execution (Vitest default)
- Mock external dependencies (Python solver, Redis)
- Limit database calls in unit tests

## Common Test Scenarios

### Testing a New Endpoint
1. Create test in `apps/api/test/<feature>.test.ts`
2. Set up test data (store, crew, roles)
3. Test happy path
4. Test validation errors (missing fields, invalid types)
5. Test authorization/permissions
6. Test edge cases (empty lists, boundary values)
7. Clean up test data

### Testing a Constraint
1. Create test in `packages/domain/test/constraints/<constraint>.test.ts`
2. Test valid scenarios (constraint satisfied)
3. Test violation scenarios (constraint broken)
4. Test boundary cases (exactly at threshold)
5. Test with empty/null inputs
6. Verify violation messages are clear

### Testing Fairness Logic
1. Create historical data (CrewRoleFairnessHistory)
2. Run fairness calculation
3. Verify Gini coefficient is correct
4. Check fairness index and grade
5. Validate tiered boost assignments
6. Verify edge cases (all equal, one outlier, no history)

## Tools

Read-only access for analysis:
- Read
- Grep
- Glob

## Model

sonnet
