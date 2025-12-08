/*
  Warnings:

  - Changed the column `assignmentModel` on the `Role` table from a scalar field to a list field. If there are non-null values in that column, this step will fail.

*/
-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "assignmentModel" SET DATA TYPE "AssignmentModel"[] USING ARRAY["assignmentModel"]::"AssignmentModel"[];
