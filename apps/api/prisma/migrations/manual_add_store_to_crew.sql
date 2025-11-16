-- First, add the name column to Store (allow NULL temporarily)
ALTER TABLE "Store" ADD COLUMN "name" TEXT;

-- Update store 768 with the name
UPDATE "Store" SET "name" = 'Dr. Phillips' WHERE "id" = 768;

-- Make name required
ALTER TABLE "Store" ALTER COLUMN "name" SET NOT NULL;

-- Add storeId column to CrewMember (allow NULL temporarily)
ALTER TABLE "CrewMember" ADD COLUMN "storeId" INTEGER;

-- Update all existing crew members to belong to store 768
UPDATE "CrewMember" SET "storeId" = 768;

-- Make storeId required and add foreign key
ALTER TABLE "CrewMember" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
