# Test Data Cleanup

## Overview

Test data cleanup utilities to remove test stores, crew, and related data from the database after tests complete.

## Automatic Cleanup

Tests automatically clean up after themselves in `afterAll` hooks:

```typescript
import { cleanupTestStores, cleanupTestCrew } from './test-cleanup';

afterAll(async () => {
  await cleanupTestStores(); // Removes test stores and all related data
  await app.close();
  await prisma.$disconnect();
});
```

## Manual Cleanup

Run the cleanup script manually to remove any leftover test data:

```bash
pnpm db:cleanup-tests
```

## What Gets Cleaned Up

### Test Stores
- **Criteria**: Store ID >= 99999 OR name contains "Test" (case-insensitive)
- **Cascades to**:
  - Crew members
  - Crew roles
  - Coverage windows
  - Hourly requirements
  - Crew role requirements
  - Logbooks and tasks
  - Runs
  - Preference satisfaction records
  - Banked preferences
  - Store-specific roles

### Test Crew
- **Criteria**: Crew ID starts with `TUN`, `TST`, or `TEST`
- **Cascades to**:
  - Crew role assignments
  - Preference satisfaction records
  - Banked preferences

## Test Utilities

Located in `/apps/api/test/test-cleanup.ts`:

### `cleanupTestStores()`
Removes all test stores and cascades deletion to all related records.

### `cleanupTestCrew(prefix?: string)`
Removes test crew members by ID prefix.
- No prefix: cleans `TUN`, `TST`, `TEST` prefixes
- With prefix: cleans only that prefix (e.g., `'TUN'`)

### `disconnectPrisma()`
Disconnects the Prisma client.

## Example Test Structure

```typescript
import { cleanupTestStores, cleanupTestCrew } from './test-cleanup';

describe('My Test Suite', () => {
  const STORE_ID = 99999 + Math.floor(Math.random() * 1000); // Random test store ID

  beforeAll(async () => {
    // Set up test data
    await prisma.store.create({
      data: { id: STORE_ID, name: 'My Test Store' }
    });
  });

  afterAll(async () => {
    // Automatic cleanup
    await cleanupTestStores();
    await app.close();
    await prisma.$disconnect();
  });

  // ... your tests
});
```

## Notes

- **Store 768** (Dr. Phillips) is a real production store, not a test store
- Test stores should use IDs >= 99999 to avoid conflicts
- Cleanup respects foreign key constraints and deletes in correct order
- All console output uses emoji indicators: 🧹 (cleaning), ✓ (success), ✅ (complete)
