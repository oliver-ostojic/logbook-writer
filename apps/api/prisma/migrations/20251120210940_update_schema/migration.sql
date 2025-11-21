/*
  Warnings:

  - You are about to drop the column `specialiationType` on the `Role` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CrewRole" ADD COLUMN     "specializationType" TEXT;

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "specialiationType";
