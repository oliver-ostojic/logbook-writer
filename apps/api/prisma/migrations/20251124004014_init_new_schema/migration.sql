/*
  Warnings:

  - You are about to drop the column `breakTimingMet` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the column `breakTimingSatisfaction` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the column `firstHourMet` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the column `firstHourSatisfaction` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the column `overallSatisfaction` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the column `taskPrefMet` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the column `taskSatisfaction` on the `PreferenceSatisfaction` table. All the data in the column will be lost.
  - You are about to drop the `Task` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[logbookId,crewId,rolePreferenceId]` on the table `PreferenceSatisfaction` will be added. If there are existing duplicate values, this will fail.
  - Made the column `storeId` on table `BankedPreference` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `rolePreferenceId` to the `PreferenceSatisfaction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AssignmentOrigin" AS ENUM ('ENGINE', 'MANUAL');

-- DropForeignKey
ALTER TABLE "BankedPreference" DROP CONSTRAINT "BankedPreference_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_crewId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_logbookId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_roleId_fkey";

-- DropIndex
DROP INDEX "PreferenceSatisfaction_crewId_date_logbookId_key";

-- DropIndex
DROP INDEX "PreferenceSatisfaction_date_idx";

-- AlterTable
ALTER TABLE "BankedPreference" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PreferenceSatisfaction" DROP COLUMN "breakTimingMet",
DROP COLUMN "breakTimingSatisfaction",
DROP COLUMN "firstHourMet",
DROP COLUMN "firstHourSatisfaction",
DROP COLUMN "overallSatisfaction",
DROP COLUMN "taskPrefMet",
DROP COLUMN "taskSatisfaction",
ADD COLUMN     "met" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rolePreferenceId" INTEGER NOT NULL,
ADD COLUMN     "satisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weightApplied" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "Task";

-- DropEnum
DROP TYPE "TaskOrigin";

-- CreateTable
CREATE TABLE "Assignment" (
    "id" UUID NOT NULL,
    "logbookId" UUID NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "origin" "AssignmentOrigin" NOT NULL DEFAULT 'ENGINE',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogPreferenceMetadata" (
    "id" UUID NOT NULL,
    "logbookId" UUID NOT NULL,
    "totalPreferences" INTEGER NOT NULL DEFAULT 0,
    "preferencesMet" INTEGER NOT NULL DEFAULT 0,
    "averageSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWeightApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogPreferenceMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_crewId_startTime_idx" ON "Assignment"("crewId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "LogPreferenceMetadata_logbookId_key" ON "LogPreferenceMetadata"("logbookId");

-- CreateIndex
CREATE INDEX "PreferenceSatisfaction_logbookId_idx" ON "PreferenceSatisfaction"("logbookId");

-- CreateIndex
CREATE UNIQUE INDEX "PreferenceSatisfaction_logbookId_crewId_rolePreferenceId_key" ON "PreferenceSatisfaction"("logbookId", "crewId", "rolePreferenceId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenceSatisfaction" ADD CONSTRAINT "PreferenceSatisfaction_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenceSatisfaction" ADD CONSTRAINT "PreferenceSatisfaction_rolePreferenceId_fkey" FOREIGN KEY ("rolePreferenceId") REFERENCES "RolePreference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogPreferenceMetadata" ADD CONSTRAINT "LogPreferenceMetadata_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankedPreference" ADD CONSTRAINT "BankedPreference_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
