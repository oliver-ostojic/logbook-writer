-- CreateEnum
CREATE TYPE "BankingStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LogbookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PrefenceTask" AS ENUM ('REGISTER', 'PRODUCT');

-- CreateEnum
CREATE TYPE "PreferenceType" AS ENUM ('FIRST_HOUR', 'TASK', 'BREAK_TIMING', 'CONSECUTIVE');

-- CreateEnum
CREATE TYPE "RoleAssignmentStrategy" AS ENUM ('UNIVERSAL', 'COVERAGE_WINDOW', 'CREW_SPECIFIC');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'FEASIBLE', 'OPTIMAL', 'TIME_LIMIT', 'INFEASIBLE', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SlotSizeMode" AS ENUM ('HALF_HOUR_ONLY', 'HOUR_ONLY', 'HALF_OR_FULL');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('ENGINE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('REGISTER', 'PRODUCT', 'PARKING_HELM', 'ORDER_WRITER', 'ART', 'MEAL_BREAK', 'TRUCK', 'DEMO', 'WINE_DEMO');

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

    CONSTRAINT "BankedPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageWindow" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "requiredPerHour" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crew" (
    "id" CHAR(7) NOT NULL,
    "name" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "shiftStartMin" INTEGER NOT NULL DEFAULT 0,
    "shiftEndMin" INTEGER NOT NULL DEFAULT 0,
    "prefBreakTiming" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prefFirstHour" "PrefenceTask",
    "prefTask" "PrefenceTask",

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewRole" (
    "crewId" CHAR(7) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specializationType" TEXT,
    "crewName" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,

    CONSTRAINT "CrewRole_pkey" PRIMARY KEY ("crewId","roleId")
);

-- CreateTable
CREATE TABLE "CrewRoleRequirement" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "requiredHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewRoleRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourlyRequirement" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hour" INTEGER NOT NULL,
    "requiredRegister" INTEGER NOT NULL DEFAULT 0,
    "requiredParkingHelm" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HourlyRequirement_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slotSizeMode" "SlotSizeMode" NOT NULL DEFAULT 'HOUR_ONLY',
    "isUniversal" BOOLEAN NOT NULL DEFAULT false,
    "isCoverageRole" BOOLEAN NOT NULL DEFAULT false,
    "isBreakRole" BOOLEAN NOT NULL DEFAULT false,
    "isParkingRole" BOOLEAN NOT NULL DEFAULT false,
    "isConsecutive" BOOLEAN NOT NULL DEFAULT false,
    "minContinuousSlots" INTEGER,
    "maxContinuousSlots" INTEGER,
    "family" TEXT,
    "assignmentStrategy" "RoleAssignmentStrategy" NOT NULL DEFAULT 'UNIVERSAL',

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Store" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'EST',
    "startRegHour" INTEGER NOT NULL DEFAULT 480,
    "endRegHour" INTEGER NOT NULL DEFAULT 1260,
    "consecutiveProdWeight" INTEGER NOT NULL DEFAULT 3,
    "consecutiveRegWeight" INTEGER NOT NULL DEFAULT 3,
    "earlyBreakWeight" INTEGER NOT NULL DEFAULT 3,
    "lateBreakWeight" INTEGER NOT NULL DEFAULT 3,
    "productFirstHourWeight" INTEGER NOT NULL DEFAULT 3,
    "productTaskWeight" INTEGER NOT NULL DEFAULT 3,
    "registerFirstHourWeight" INTEGER NOT NULL DEFAULT 3,
    "registerTaskWeight" INTEGER NOT NULL DEFAULT 3,
    "registerMinMinutesPerCrew" INTEGER NOT NULL DEFAULT 120,
    "registerMaxMinutesPerCrew" INTEGER NOT NULL DEFAULT 300,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "logbookId" UUID NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "type" "TaskType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "origin" "TaskOrigin" NOT NULL DEFAULT 'ENGINE',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankedPreference_crewId_expiresAt_idx" ON "BankedPreference"("crewId" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE INDEX "BankedPreference_crewId_status_idx" ON "BankedPreference"("crewId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "CoverageWindow_storeId_date_idx" ON "CoverageWindow"("storeId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CoverageWindow_storeId_date_roleId_key" ON "CoverageWindow"("storeId" ASC, "date" ASC, "roleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CrewRoleRequirement_storeId_date_crewId_roleId_key" ON "CrewRoleRequirement"("storeId" ASC, "date" ASC, "crewId" ASC, "roleId" ASC);

-- CreateIndex
CREATE INDEX "CrewRoleRequirement_storeId_date_idx" ON "CrewRoleRequirement"("storeId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HourlyRequirement_storeId_date_hour_key" ON "HourlyRequirement"("storeId" ASC, "date" ASC, "hour" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Logbook_storeId_date_status_key" ON "Logbook"("storeId" ASC, "date" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "PreferenceSatisfaction_crewId_date_idx" ON "PreferenceSatisfaction"("crewId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PreferenceSatisfaction_crewId_date_logbookId_key" ON "PreferenceSatisfaction"("crewId" ASC, "date" ASC, "logbookId" ASC);

-- CreateIndex
CREATE INDEX "PreferenceSatisfaction_date_idx" ON "PreferenceSatisfaction"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code" ASC);

-- CreateIndex
CREATE INDEX "Run_storeId_date_idx" ON "Run"("storeId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "Task_crewId_startTime_idx" ON "Task"("crewId" ASC, "startTime" ASC);

-- AddForeignKey
ALTER TABLE "BankedPreference" ADD CONSTRAINT "BankedPreference_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageWindow" ADD CONSTRAINT "CoverageWindow_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageWindow" ADD CONSTRAINT "CoverageWindow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRole" ADD CONSTRAINT "CrewRole_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRole" ADD CONSTRAINT "CrewRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRoleRequirement" ADD CONSTRAINT "CrewRoleRequirement_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRoleRequirement" ADD CONSTRAINT "CrewRoleRequirement_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRoleRequirement" ADD CONSTRAINT "CrewRoleRequirement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyRequirement" ADD CONSTRAINT "HourlyRequirement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logbook" ADD CONSTRAINT "Logbook_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenceSatisfaction" ADD CONSTRAINT "PreferenceSatisfaction_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
