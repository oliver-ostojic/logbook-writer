-- Add valueInt to RoleRule for hour-based rules (CANNOT_ASSIGN_DURING_STORE_HOUR_X, LIKE_ROLE_FOR_HOUR_X, etc.)
-- This allows multiple rules for the same role+type but different hours

-- Step 1: Drop the existing unique constraint on RoleRule
ALTER TABLE "RoleRule" DROP CONSTRAINT IF EXISTS "RoleRule_roleId_type_targetRoleId_key";

-- Step 2: Add valueInt column to RoleRule (nullable for backward compatibility)
ALTER TABLE "RoleRule" ADD COLUMN IF NOT EXISTS "valueInt" INTEGER;

-- Step 3: Add new unique constraint that includes valueInt
-- Using a partial index approach: (roleId, type, targetRoleId, valueInt) 
-- But since valueInt can be NULL for non-hour rules, we use COALESCE
CREATE UNIQUE INDEX "RoleRule_roleId_type_targetRoleId_valueInt_key" 
ON "RoleRule" ("roleId", "type", COALESCE("targetRoleId", 0), COALESCE("valueInt", 0));

-- Note: For StoreRoleRule and CrewRoleRule, the valueInt is already there
-- and serves as an override. So we may not need to change those unique constraints
-- unless you want multiple overrides per crew per rule.
