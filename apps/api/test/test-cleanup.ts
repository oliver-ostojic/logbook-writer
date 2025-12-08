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

    // 1. Assignments (depend on crew and logbook)
    const assignmentsDeleted = await prisma.assignment.deleteMany({
      where: {
        OR: [
          { crew: { storeId: { in: storeIds } } },
          { logbook: { storeId: { in: storeIds } } }
        ]
      }
    });
    if (assignmentsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${assignmentsDeleted.count} assignments`);
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
      where: { crew: { storeId: { in: storeIds } } }
    });
    if (crewRolesDeleted.count > 0) {
      console.log(`   ✓ Deleted ${crewRolesDeleted.count} crew role assignments`);
    }

    // 5. Preference satisfaction records
    const prefSatDeleted = await prisma.preferenceSatisfaction.deleteMany({
      where: { crew: { storeId: { in: storeIds } } }
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

    // 7. Daily role constraints
    const dailyReqsDeleted = await prisma.dailyRoleConstraint.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (dailyReqsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${dailyReqsDeleted.count} daily role constraints`);
    }

    // 8. Hourly role constraints
    const hourlyRoleDeleted = await prisma.hourlyRoleConstraint.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (hourlyRoleDeleted.count > 0) {
      console.log(`   ✓ Deleted ${hourlyRoleDeleted.count} hourly role constraints`);
    }

    // 9. Window role constraints
    const windowRoleDeleted = await prisma.windowRoleConstraint.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (windowRoleDeleted.count > 0) {
      console.log(`   ✓ Deleted ${windowRoleDeleted.count} window role constraints`);
    }

    // 10. Shifts
    const shiftsDeleted = await prisma.shift.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (shiftsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${shiftsDeleted.count} shifts`);
    }

    // 11. Crew members
    const crewDeleted = await prisma.crew.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (crewDeleted.count > 0) {
      console.log(`   ✓ Deleted ${crewDeleted.count} crew members`);
    }

    // 12. Role preferences & roles (if they belong to test stores)
    const rolePrefsDeleted = await prisma.rolePreference.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (rolePrefsDeleted.count > 0) {
      console.log(`   ✓ Deleted ${rolePrefsDeleted.count} role preferences`);
    }
    const rolesDeleted = await prisma.role.deleteMany({
      where: { storeId: { in: storeIds } }
    });
    if (rolesDeleted.count > 0) {
      console.log(`   ✓ Deleted ${rolesDeleted.count} roles`);
    }

    // 13. Finally, delete the stores themselves
    const storesDeleted = await prisma.store.deleteMany({
      where: { id: { in: storeIds } }
    });
    console.log(`   ✓ Deleted ${storesDeleted.count} test stores`);

    // 14. Cleanup orphan test companies (no stores remain)
    const orphanCompanies = await prisma.company.findMany({
      where: {
        name: { contains: 'Test', mode: 'insensitive' },
        stores: { none: {} },
      },
      select: { id: true, name: true }
    });
    if (orphanCompanies.length) {
      const ids = orphanCompanies.map(c => c.id);
      const companiesDeleted = await prisma.company.deleteMany({ where: { id: { in: ids } } });
      console.log(`   ✓ Deleted ${companiesDeleted.count} orphan test companies`);
    }

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
    where: { crew: where }
  });

  // Delete preference satisfaction records
  await prisma.preferenceSatisfaction.deleteMany({
    where: { crew: where }
  });

  // Delete banked preferences
  await prisma.bankedPreference.deleteMany({
    where: { Crew: where }
  });

  // Delete crew preferences
  await prisma.crewPreference.deleteMany({
    where: { crew: where }
  });

  // Delete daily role constraints tied to crew
  await prisma.dailyRoleConstraint.deleteMany({
    where: { crew: where }
  });

  // Delete shifts for these crew
  await prisma.shift.deleteMany({
    where: { crew: where }
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
