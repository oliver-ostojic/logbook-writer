-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssignmentModel" ADD VALUE 'UNIVERSAL';
ALTER TYPE "AssignmentModel" ADD VALUE 'COVERAGE_WINDOW';
ALTER TYPE "AssignmentModel" ADD VALUE 'CREW_SPECIFIC';

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "assignmentModel" DROP NOT NULL,
ALTER COLUMN "assignmentModel" DROP DEFAULT;
