/*
  Warnings:

  - You are about to drop the column `specialization` on the `CrewRole` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CrewRole" DROP COLUMN "specialization",
ADD COLUMN     "specializationType" TEXT;
