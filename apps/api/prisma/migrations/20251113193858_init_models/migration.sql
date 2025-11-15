-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'FEASIBLE', 'OPTIMAL', 'TIME_LIMIT', 'INFEASIBLE', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LogbookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('REGISTER', 'PRODUCT', 'PARKING_HELM', 'ORDER_WRITER', 'ART', 'MEAL_BREAK', 'TRUCK', 'DEMO');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('ENGINE', 'MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" CHAR(7) NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" UUID,
    "blockSize" INTEGER NOT NULL,
    "taskPreference" "TaskType",
    "firstHourPreference" "TaskType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canBreak" BOOLEAN NOT NULL DEFAULT true,
    "canParkingHelms" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" INTEGER NOT NULL,
    "minRegisterHours" INTEGER NOT NULL,
    "maxRegisterHours" INTEGER NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreHourRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hour" INTEGER NOT NULL,
    "requiredRegisters" INTEGER NOT NULL,
    "minProduct" INTEGER,
    "minParking" INTEGER NOT NULL,
    "maxParking" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreHourRule_pkey" PRIMARY KEY ("id")
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
    "type" "TaskType" NOT NULL,
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
CREATE TABLE "DailyRoleCoverage" (
    "id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "roleId" UUID NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "requiredPerHour" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DailyRoleCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreHourRule_storeId_date_hour_key" ON "StoreHourRule"("storeId", "date", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "Logbook_storeId_date_status_key" ON "Logbook"("storeId", "date", "status");

-- CreateIndex
CREATE INDEX "Task_crewId_startTime_idx" ON "Task"("crewId", "startTime");

-- CreateIndex
CREATE INDEX "Run_storeId_date_idx" ON "Run"("storeId", "date");

-- CreateIndex
CREATE INDEX "DailyRoleCoverage_storeId_date_idx" ON "DailyRoleCoverage"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRoleCoverage_date_storeId_roleId_key" ON "DailyRoleCoverage"("date", "storeId", "roleId");

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreHourRule" ADD CONSTRAINT "StoreHourRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logbook" ADD CONSTRAINT "Logbook_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "CrewMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "Logbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoleCoverage" ADD CONSTRAINT "DailyRoleCoverage_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
