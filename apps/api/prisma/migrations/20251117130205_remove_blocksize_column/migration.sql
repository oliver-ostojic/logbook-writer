/*
  Warnings:

  - You are about to drop the column `blockSize` on the `CrewMember` table. All the data in the column will be lost.
  - You are about to drop the column `firstHourPreference` on the `CrewMember` table. All the data in the column will be lost.
  - You are about to drop the column `taskPreference` on the `CrewMember` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "DailyRoleRequirement" DROP CONSTRAINT "DailyRoleRequirement_crewId_fkey";

-- AlterTable
ALTER TABLE "CrewMember" DROP COLUMN "blockSize",
DROP COLUMN "firstHourPreference",
DROP COLUMN "taskPreference";
