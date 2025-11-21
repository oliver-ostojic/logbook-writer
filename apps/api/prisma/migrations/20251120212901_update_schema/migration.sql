/*
  Warnings:

  - The `prefFirstHour` column on the `Crew` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `prefTask` column on the `Crew` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PrefenceTask" AS ENUM ('REGISTER', 'PRODUCT');

-- AlterTable
ALTER TABLE "Crew" DROP COLUMN "prefFirstHour",
ADD COLUMN     "prefFirstHour" "PrefenceTask",
DROP COLUMN "prefTask",
ADD COLUMN     "prefTask" "PrefenceTask";
