-- AlterTable
ALTER TABLE "CrewMember" ADD COLUMN "prefFirstHourWeight" INTEGER,
ADD COLUMN "prefTaskWeight" INTEGER,
ADD COLUMN "prefBlocksizeProdWeight" INTEGER,
ADD COLUMN "prefBlocksizeRegWeight" INTEGER,
ADD COLUMN "prefFirstHour" "TaskType",
ADD COLUMN "prefTask" "TaskType",
ADD COLUMN "prefBlocksizeProd" INTEGER,
ADD COLUMN "prefBlocksizeReg" INTEGER;
