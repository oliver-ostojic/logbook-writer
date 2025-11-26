-- Migrate data from legacy specializationType to new specialization column, then drop old column
-- Ensure the new column exists (Prisma schema declares it). If it does not, create it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='CrewRole' AND column_name='specialization'
  ) THEN
    ALTER TABLE "CrewRole" ADD COLUMN "specialization" TEXT;
  END IF;
END $$;

-- Copy data (only where specialization is null to avoid overwriting)
UPDATE "CrewRole" SET "specialization" = "specializationType" WHERE "specialization" IS NULL;

-- Drop the legacy column if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='CrewRole' AND column_name='specializationType'
  ) THEN
    ALTER TABLE "CrewRole" DROP COLUMN "specializationType";
  END IF;
END $$;
