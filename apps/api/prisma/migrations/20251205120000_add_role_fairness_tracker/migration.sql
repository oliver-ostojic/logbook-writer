-- CreateTable
CREATE TABLE "RoleFairnessTracker" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "lookbackDays" INTEGER NOT NULL DEFAULT 14,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleFairnessTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewRoleFairnessHistory" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "minutesAssigned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewRoleFairnessHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleFairnessTracker_storeId_roleId_key" ON "RoleFairnessTracker"("storeId", "roleId");

-- CreateIndex
CREATE INDEX "CrewRoleFairnessHistory_storeId_roleId_crewId_windowEnd_idx" ON "CrewRoleFairnessHistory"("storeId", "roleId", "crewId", "windowEnd");

-- AddForeignKey
ALTER TABLE "RoleFairnessTracker" ADD CONSTRAINT "RoleFairnessTracker_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleFairnessTracker" ADD CONSTRAINT "RoleFairnessTracker_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRoleFairnessHistory" ADD CONSTRAINT "CrewRoleFairnessHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRoleFairnessHistory" ADD CONSTRAINT "CrewRoleFairnessHistory_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRoleFairnessHistory" ADD CONSTRAINT "CrewRoleFairnessHistory_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
