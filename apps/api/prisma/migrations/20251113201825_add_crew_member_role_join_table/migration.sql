/*
  Warnings:

  - You are about to drop the column `roleId` on the `CrewMember` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "CrewMember" DROP CONSTRAINT "CrewMember_roleId_fkey";

-- AlterTable
ALTER TABLE "CrewMember" DROP COLUMN "roleId";

-- CreateTable
CREATE TABLE "CrewMemberRole" (
    "crewMemberId" CHAR(7) NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewMemberRole_pkey" PRIMARY KEY ("crewMemberId","roleId")
);

-- AddForeignKey
ALTER TABLE "CrewMemberRole" ADD CONSTRAINT "CrewMemberRole_crewMemberId_fkey" FOREIGN KEY ("crewMemberId") REFERENCES "CrewMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMemberRole" ADD CONSTRAINT "CrewMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
