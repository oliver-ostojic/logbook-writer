/*
  Warnings:

  - Added the required column `storeId` to the `CrewMember` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Store` table without a default value. This is not possible if the table is not empty.

*/
-- Step 1: Add name column to Store (allow NULL temporarily)
ALTER TABLE "Store" ADD COLUMN "name" TEXT;

-- Step 2: Update store 768 with the name
UPDATE "Store" SET "name" = 'Dr. Phillips' WHERE "id" = 768;

-- Step 3: Make name required
ALTER TABLE "Store" ALTER COLUMN "name" SET NOT NULL;

-- Step 4: Add storeId column to CrewMember (allow NULL temporarily)
ALTER TABLE "CrewMember" ADD COLUMN "storeId" INTEGER;

-- Step 5: Update all existing crew members to belong to store 768
UPDATE "CrewMember" SET "storeId" = 768;

-- Step 6: Make storeId required
ALTER TABLE "CrewMember" ALTER COLUMN "storeId" SET NOT NULL;

-- Step 7: Add foreign key constraint
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
