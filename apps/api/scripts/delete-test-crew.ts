import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Check crew
async function checkCrew() {
  const crew = await prisma.crew.findUnique({ 
    where: { id: '1290542' },
    include: { CrewRole: { include: { Role: true } } }
  });
  console.log('Crew:', JSON.stringify(crew, null, 2));
  
  // Also count total crew for store 768
  const count = await prisma.crew.count({ where: { storeId: 768 } });
  console.log('Total crew in store 768:', count);
}

checkCrew()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

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

deleteTestCrew()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
