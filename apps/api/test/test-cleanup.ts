/**
 * Test cleanup utilities
 * 
 * Provides functions to clean up test data from the database after tests complete.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean up test stores and all related data
 * 
 * Identifies test stores by:
 * - Store ID >= 99999 (tuning test stores)
 * - Store name contains "Test" (case-insensitive)
 * 
 * Cascades deletion to:
 * - Crew members
 * - Crew roles
 * - Coverage windows
 * - Hourly requirements
 * - Crew role requirements
 * - Logbooks and tasks
 * - Roles (if storeId matches)
 */
export async function cleanupTestStores() {
  try {
    // Find test stores
    const testStores = await prisma.store.findMany({
      where: {
        OR: [
          { id: { gte: 99999 } }, // Tuning test stores use random IDs >= 99999
          { name: { contains: 'Test', mode: 'insensitive' } }
        ]
      },
      select: { id: true, name: true }
    });

    if (testStores.length === 0) {
      console.log('✓ No test stores to clean up');
      return;
    }

    console.log(`🧹 Cleaning up ${testStores.length} test store(s)...`);
    testStores.forEach(s => console.log(`   - ${s.id}: ${s.name}`));

    const storeIds = testStores.map(s => s.id);

    // Delete in correct order to respect foreign key constraints

    // 1. Tasks (depend on crew and logbook)
    const tasksDeleted = await prisma.task.deleteMany({
      where: { 
        OR: [
          { crew: { storeId: { in: storeIds } } },
          { logbook: { storeId: { in: storeIds } } }
        ]
      }
    });
    if (tasksDeleted.count > 0) {
      console.log(`   ✓ Deleted ${tasksDeleted.count} tasks`);
    }

    // 2. Runs (depend on logbook)
    const runsDeleted = await prisma.run.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (runsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${runsDeleted.count} runs`);
    }

    // 3. Logbooks
    const logbooksDeleted = await prisma.logbook.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (logbooksDeleted.count > 0) {
      console.log(`   ✓ Deleted ${logbooksDeleted.count} logbooks`);
    }

    // 4. Crew role relationships
    const crewRolesDeleted = await prisma.crewRole.deleteMany({
      where: { Crew: { storeId: { in: storeIds } } }
    });
    if (crewRolesDeleted.count > 0) {
      console.log(`   ✓ Deleted ${crewRolesDeleted.count} crew role assignments`);
    }

    // 5. Preference satisfaction records
    const prefSatDeleted = await prisma.preferenceSatisfaction.deleteMany({
      where: { Crew: { storeId: { in: storeIds } } }
    });
    if (prefSatDeleted.count > 0) {
      console.log(`   ✓ Deleted ${prefSatDeleted.count} preference satisfaction records`);
    }

    // 6. Banked preferences
    const bankedDeleted = await prisma.bankedPreference.deleteMany({
      where: { Crew: { storeId: { in: storeIds } } }
    });
    if (bankedDeleted.count > 0) {
      console.log(`   ✓ Deleted ${bankedDeleted.count} banked preferences`);
    }

    // 7. Crew role requirements
    const crewReqsDeleted = await prisma.crewRoleRequirement.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (crewReqsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${crewReqsDeleted.count} crew role requirements`);
    }

    // 8. Hourly requirements
    const hourlyReqsDeleted = await prisma.hourlyRequirement.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (hourlyReqsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${hourlyReqsDeleted.count} hourly requirements`);
    }

    // 9. Coverage windows
    const coverageDeleted = await prisma.coverageWindow.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (coverageDeleted.count > 0) {
      console.log(`   ✓ Deleted ${coverageDeleted.count} coverage windows`);
    }

    // 10. Crew members
    const crewDeleted = await prisma.crew.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (crewDeleted.count > 0) {
      console.log(`   ✓ Deleted ${crewDeleted.count} crew members`);
    }

    // 11. Roles (if they belong to test stores)
    const rolesDeleted = await prisma.role.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (rolesDeleted.count > 0) {
      console.log(`   ✓ Deleted ${rolesDeleted.count} roles`);
    }

    // 12. Finally, delete the stores themselves
    const storesDeleted = await prisma.store.deleteMany({
      where: { id: { in: storeIds } }
    });
    console.log(`   ✓ Deleted ${storesDeleted.count} test stores`);

    console.log('✅ Test cleanup complete!\n');
  } catch (error) {
    console.error('❌ Error during test cleanup:', error);
    throw error;
  }
}

/**
 * Clean up test crew members (crew IDs starting with 'TUN', 'TST', etc.)
 */
export async function cleanupTestCrew(prefix?: string) {
  const where = prefix 
    ? { id: { startsWith: prefix } }
    : { 
        OR: [
          { id: { startsWith: 'TUN' } },  // Tuning test crew
          { id: { startsWith: 'TST' } },  // Test crew
          { id: { startsWith: 'TEST' } }, // Test crew
        ]
      };

  // Delete crew role relationships first
  await prisma.crewRole.deleteMany({
    where: { Crew: where }
  });

  // Delete preference satisfaction records
  await prisma.preferenceSatisfaction.deleteMany({
    where: { Crew: where }
  });

  // Delete banked preferences
  await prisma.bankedPreference.deleteMany({
    where: { Crew: where }
  });

  // Delete crew members
  const deleted = await prisma.crew.deleteMany({ where });

  if (deleted.count > 0) {
    console.log(`✓ Cleaned up ${deleted.count} test crew member(s)`);
  }
}

/**
 * Disconnect Prisma client
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
