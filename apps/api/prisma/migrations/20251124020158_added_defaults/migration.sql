/*
  Warnings:

  - Made the column `storeId` on table `Role` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Role" DROP CONSTRAINT "Role_storeId_fkey";

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "openMinutesFromMidnight" SET DEFAULT 480,
ALTER COLUMN "closeMinutesFromMidnight" SET DEFAULT 1260;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
