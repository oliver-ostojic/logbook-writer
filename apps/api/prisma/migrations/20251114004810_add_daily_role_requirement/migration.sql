-- CreateTable
CREATE TABLE "DailyRoleRequirement" (
    "id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "roleId" UUID NOT NULL,
    "requiredHours" INTEGER NOT NULL,

    CONSTRAINT "DailyRoleRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyRoleRequirement_storeId_date_idx" ON "DailyRoleRequirement"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRoleRequirement_date_storeId_crewId_roleId_key" ON "DailyRoleRequirement"("date", "storeId", "crewId", "roleId");

-- AddForeignKey
ALTER TABLE "DailyRoleRequirement" ADD CONSTRAINT "DailyRoleRequirement_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "CrewMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoleRequirement" ADD CONSTRAINT "DailyRoleRequirement_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
