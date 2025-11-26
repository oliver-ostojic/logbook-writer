-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'FEASIBLE', 'OPTIMAL', 'TIME_LIMIT', 'INFEASIBLE', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LogbookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('ENGINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PreferenceType" AS ENUM ('FIRST_HOUR', 'FAVORITE', 'TIMING', 'CONSECUTIVE');

-- CreateEnum
CREATE TYPE "BankingStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AssignmentModel" AS ENUM ('UNIVERSAL', 'COVERAGE_WINDOW', 'CREW_SPECIFIC');

-- CreateTable
CREATE TABLE "Store" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'EST',
    "baseSlotMinutes" INTEGER NOT NULL DEFAULT 30,
    "openMinutesFromMidnight" INTEGER NOT NULL DEFAULT 420,
    "closeMinutesFromMidnight" INTEGER NOT NULL DEFAULT 1320,
    "reqShiftLengthForBreak" INTEGER NOT NULL DEFAULT 360,
    "breakWindowStart" INTEGER NOT NULL DEFAULT 180,
    "breakWindowEnd" INTEGER NOT NULL DEFAULT 270,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "assignmentModel" "AssignmentModel" NOT NULL DEFAULT 'UNIVERSAL',
    "slotsMustBeConsecutive" BOOLEAN NOT NULL DEFAULT false,
    "minSlots" INTEGER NOT NULL,
    "maxSlots" INTEGER NOT NULL,
    "allowOutsideStoreHours" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crew" (
    "id" CHAR(7) NOT NULL,
    "name" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "cachedShiftStartMin" INTEGER NOT NULL DEFAULT 0,
    "cachedShiftEndMin" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Logbook" (
    "id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "status" "LogbookStatus" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "storedFilePath" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Logbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "logbookId" UUID NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "origin" "TaskOrigin" NOT NULL DEFAULT 'ENGINE',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "engine" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL,
    "runtimeMs" INTEGER NOT NULL,
    "violations" JSONB NOT NULL,
    "objectiveScore" INTEGER,
    "mipGap" DOUBLE PRECISION,
    "logbookId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourlyRoleConstraint" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hour" INTEGER NOT NULL,
    "requiredPerHour" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "HourlyRoleConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowRoleConstraint" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "requiredPerHour" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "WindowRoleConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRoleConstraint" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "requiredHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRoleConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewRole" (
    "specializationType" TEXT,
    "crewName" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crewId" CHAR(7) NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "CrewRole_pkey" PRIMARY KEY ("crewId","roleId")
);

-- CreateTable
CREATE TABLE "RolePreference" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "roleId" INTEGER,
    "preferenceType" "PreferenceType" NOT NULL,
    "baseWeight" INTEGER NOT NULL DEFAULT 1,
    "allowBanking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewPreference" (
    "id" SERIAL NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "rolePreferenceId" INTEGER NOT NULL,
    "crewWeight" INTEGER NOT NULL DEFAULT 1,
    "intValue" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferenceSatisfaction" (
    "id" SERIAL NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "logbookId" UUID NOT NULL,
    "firstHourSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakTimingSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstHourMet" BOOLEAN NOT NULL DEFAULT false,
    "taskPrefMet" BOOLEAN NOT NULL DEFAULT false,
    "breakTimingMet" BOOLEAN NOT NULL DEFAULT false,
    "adaptiveBoost" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "fairnessAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreferenceSatisfaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankedPreference" (
    "id" SERIAL NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "preferenceType" "PreferenceType" NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "originalDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedDate" TIMESTAMP(3),
    "status" "BankingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER,

    CONSTRAINT "BankedPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Logbook_storeId_date_status_key" ON "Logbook"("storeId", "date", "status");

-- CreateIndex
CREATE INDEX "Task_crewId_startTime_idx" ON "Task"("crewId", "startTime");

-- CreateIndex
CREATE INDEX "Run_storeId_date_idx" ON "Run"("storeId", "date");

-- CreateIndex
CREATE INDEX "HourlyRoleConstraint_storeId_date_hour_idx" ON "HourlyRoleConstraint"("storeId", "date", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "HourlyRoleConstraint_storeId_date_hour_roleId_key" ON "HourlyRoleConstraint"("storeId", "date", "hour", "roleId");

-- CreateIndex
CREATE INDEX "WindowRoleConstraint_storeId_date_idx" ON "WindowRoleConstraint"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WindowRoleConstraint_storeId_date_roleId_key" ON "WindowRoleConstraint"("storeId", "date", "roleId");

-- CreateIndex
CREATE INDEX "DailyRoleConstraint_storeId_date_idx" ON "DailyRoleConstraint"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRoleConstraint_storeId_date_crewId_roleId_key" ON "DailyRoleConstraint"("storeId", "date", "crewId", "roleId");

-- CreateIndex
CREATE INDEX "RolePreference_storeId_preferenceType_idx" ON "RolePreference"("storeId", "preferenceType");

-- CreateIndex
CREATE UNIQUE INDEX "RolePreference_storeId_roleId_preferenceType_key" ON "RolePreference"("storeId", "roleId", "preferenceType");

-- CreateIndex
CREATE INDEX "CrewPreference_crewId_rolePreferenceId_idx" ON "CrewPreference"("crewId", "rolePreferenceId");

-- CreateIndex
CREATE INDEX "PreferenceSatisfaction_crewId_date_idx" ON "PreferenceSatisfaction"("crewId", "date");

-- CreateIndex
CREATE INDEX "PreferenceSatisfaction_date_idx" ON "PreferenceSatisfaction"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PreferenceSatisfaction_crewId_date_logbookId_key" ON "PreferenceSatisfaction"("crewId", "date", "logbookId");

-- CreateIndex
CREATE INDEX "BankedPreference_crewId_status_idx" ON "BankedPreference"("crewId", "status");

-- CreateIndex
CREATE INDEX "BankedPreference_crewId_expiresAt_idx" ON "BankedPreference"("crewId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logbook" ADD CONSTRAINT "Logbook_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyRoleConstraint" ADD CONSTRAINT "HourlyRoleConstraint_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyRoleConstraint" ADD CONSTRAINT "HourlyRoleConstraint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowRoleConstraint" ADD CONSTRAINT "WindowRoleConstraint_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowRoleConstraint" ADD CONSTRAINT "WindowRoleConstraint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoleConstraint" ADD CONSTRAINT "DailyRoleConstraint_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoleConstraint" ADD CONSTRAINT "DailyRoleConstraint_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoleConstraint" ADD CONSTRAINT "DailyRoleConstraint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRole" ADD CONSTRAINT "CrewRole_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRole" ADD CONSTRAINT "CrewRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePreference" ADD CONSTRAINT "RolePreference_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePreference" ADD CONSTRAINT "RolePreference_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewPreference" ADD CONSTRAINT "CrewPreference_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewPreference" ADD CONSTRAINT "CrewPreference_rolePreferenceId_fkey" FOREIGN KEY ("rolePreferenceId") REFERENCES "RolePreference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenceSatisfaction" ADD CONSTRAINT "PreferenceSatisfaction_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankedPreference" ADD CONSTRAINT "BankedPreference_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankedPreference" ADD CONSTRAINT "BankedPreference_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
