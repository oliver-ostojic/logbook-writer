-- Add rolePreferenceId foreign key
ALTER TABLE "BankedPreference"
    ADD COLUMN "rolePreferenceId" INTEGER NOT NULL;

ALTER TABLE "BankedPreference"
    ADD CONSTRAINT "BankedPreference_rolePreferenceId_fkey" FOREIGN KEY ("rolePreferenceId")
    REFERENCES "RolePreference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure only one entry per crew + preference per status
CREATE UNIQUE INDEX "BankedPreference_crewId_rolePreferenceId_status_key"
    ON "BankedPreference"("crewId", "rolePreferenceId", "status");
