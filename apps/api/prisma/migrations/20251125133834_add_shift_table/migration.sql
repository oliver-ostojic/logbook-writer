/*
  Warnings:

  - You are about to drop the column `cachedShiftEndMin` on the `Crew` table. All the data in the column will be lost.
  - You are about to drop the column `cachedShiftStartMin` on the `Crew` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Crew" DROP COLUMN "cachedShiftEndMin",
DROP COLUMN "cachedShiftStartMin";

-- CreateTable
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "crewId" CHAR(7) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_storeId_date_idx" ON "Shift"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_storeId_date_crewId_key" ON "Shift"("storeId", "date", "crewId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
