/*
  Warnings:

  - The values [UNIVERSAL,COVERAGE_WINDOW,CREW_SPECIFIC] on the enum `AssignmentModel` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AssignmentModel_new" AS ENUM ('HOURLY', 'HOURLY_WINDOW', 'DAILY');
ALTER TABLE "Role" ALTER COLUMN "assignmentModel" TYPE "AssignmentModel_new" USING ("assignmentModel"::text::"AssignmentModel_new");
ALTER TYPE "AssignmentModel" RENAME TO "AssignmentModel_old";
ALTER TYPE "AssignmentModel_new" RENAME TO "AssignmentModel";
DROP TYPE "AssignmentModel_old";
COMMIT;
