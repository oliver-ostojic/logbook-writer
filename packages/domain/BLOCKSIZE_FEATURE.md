# Role Block Size Feature

## Problem Identified

With only `minSlots` and `maxSlots`, we couldn't enforce that assignments must be in specific increments.

**Example Issue:**
- Register: `minSlots=2, maxSlots=10` (with 30min slots)
- This allowed: 2 slots ✓, **3 slots ✓**, 4 slots ✓, **5 slots ✓**, etc.
- But Register needs **1-hour increments only** (2, 4, 6, 8, 10 slots)

## Solution: `blockSize` Attribute

Added `Role.blockSize` to enforce that assignments must be in multiples of N slots.

### Schema Change

```prisma
model Role {
  minSlots      Int @default(1)
  maxSlots      Int @default(1)
  blockSize     Int @default(1)  // NEW: assignments must be multiples of this many slots
}
```

**Default**: `blockSize = 1` (any slot count allowed - backward compatible)

### Validation Logic

```typescript
// Assignment duration must be multiple of blockSize
if (role.blockSize > 1 && slots % role.blockSize !== 0) {
  violations.push(`Assignment must be in blocks of ${role.blockSize} slots`);
}
```

## Real-World Examples

### Register (1-hour increments)
```typescript
{
  minSlots: 2,   // 1 hour minimum
  maxSlots: 16,  // 8 hours maximum
  blockSize: 2,  // must be in 2-slot (1 hour) increments
}
```

**Valid**: 1hr (2 slots), 2hr (4 slots), 3hr (6 slots), 4hr (8 slots)
**Invalid**: 1.5hr (3 slots), 2.5hr (5 slots), 3.5hr (7 slots)

### Order Writer (any duration within range)
```typescript
{
  minSlots: 2,   // 1 hour minimum
  maxSlots: 4,   // 2 hours maximum
  blockSize: 1,  // any slot count allowed
}
```

**Valid**: 1hr (2 slots), 1.5hr (3 slots), 2hr (4 slots)

### Special Role (2-hour increments)
```typescript
{
  minSlots: 4,   // 2 hour minimum
  maxSlots: 16,  // 8 hours maximum
  blockSize: 4,  // must be in 4-slot (2 hour) increments
}
```

**Valid**: 2hr (4 slots), 4hr (8 slots), 6hr (12 slots), 8hr (16 slots)
**Invalid**: 3hr (6 slots), 5hr (10 slots)

## Testing

Added 12 comprehensive tests in `roleSlotDuration.test.ts`:

- ✅ blockSize=2 with valid increments (2, 4, 6 slots)
- ❌ blockSize=2 with invalid increments (3, 5, 7 slots)
- ✅ blockSize=4 with valid increments (4, 8 slots)
- ❌ blockSize=4 with invalid increment (6 slots)
- ✅ blockSize=1 allows any slot count

## Database Migration

```sql
-- Migration: 20251124150851_add_role_block_size
ALTER TABLE "Role" ADD COLUMN "blockSize" INTEGER NOT NULL DEFAULT 1;
```

**Status**: ✅ Applied to database

## Next Steps

You can now update specific roles in the database:

```sql
-- Set Register to require 1-hour increments
UPDATE "Role" 
SET "blockSize" = 2 
WHERE "code" = 'REGISTER';
```

## Test Results

- **Before**: 95 tests passing
- **After**: 107 tests passing (+12)
- All existing tests still pass (backward compatible)
