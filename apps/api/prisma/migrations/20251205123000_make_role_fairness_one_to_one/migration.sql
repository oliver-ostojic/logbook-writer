-- Drop the previous composite unique constraint so we can enforce one tracker per role
DROP INDEX IF EXISTS "RoleFairnessTracker_storeId_roleId_key";

-- Enforce one-to-one between Role and RoleFairnessTracker
CREATE UNIQUE INDEX "RoleFairnessTracker_roleId_key" ON "RoleFairnessTracker"("roleId");

-- Preserve fast lookups by store
CREATE INDEX IF NOT EXISTS "RoleFairnessTracker_storeId_idx" ON "RoleFairnessTracker"("storeId");
