import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test/duplicate crew members to delete
const CREW_IDS_TO_DELETE = ['TCREW93', '1286822', '1284237', '1284686'];

async function deleteTestCrew() {
  console.log('Deleting test crew members:', CREW_IDS_TO_DELETE);

  for (const crewId of CREW_IDS_TO_DELETE) {
    console.log(`\nProcessing crew ${crewId}...`);

    // Check if crew exists
    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) {
      console.log(`  Crew ${crewId} not found, skipping`);
      continue;
    }
    console.log(`  Found: ${crew.name} (store ${crew.storeId})`);

    // Delete related records in order (respecting foreign keys)
    const deletedAssignments = await prisma.assignment.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedAssignments.count} assignments`);

    const deletedBankedPrefs = await prisma.bankedPreference.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedBankedPrefs.count} banked preferences`);

    const deletedCrewPrefs = await prisma.crewPreference.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedCrewPrefs.count} crew preferences`);

    const deletedCrewRoles = await prisma.crewRole.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedCrewRoles.count} crew roles`);

    const deletedFairnessHistory = await prisma.crewRoleFairnessHistory.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedFairnessHistory.count} fairness history records`);

    const deletedQuotas = await prisma.crewRoleQuota.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedQuotas.count} crew role quotas`);

    const deletedRules = await prisma.crewRoleRule.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedRules.count} crew role rules`);

    const deletedSatisfaction = await prisma.preferenceSatisfaction.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedSatisfaction.count} preference satisfaction records`);

    const deletedShifts = await prisma.shift.deleteMany({ where: { crewId } });
    console.log(`  Deleted ${deletedShifts.count} shifts`);

    // Finally delete the crew member
    await prisma.crew.delete({ where: { id: crewId } });
    console.log(`  ✅ Deleted crew ${crewId} (${crew.name})`);
  }

  console.log('\n✅ Done!');
}

async function main() {
  await deleteTestCrew();
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
