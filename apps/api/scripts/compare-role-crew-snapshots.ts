import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 Comparing crew counts:\n');
  console.log('1. Database CrewRole table (current crew-to-role assignments)');
  console.log('2. RoleFairnessSnapshot (stored at logbook generation time)\n');

  // Get database counts from CrewRole
  const roles = await prisma.role.findMany({
    include: {
      CrewRole: {
        select: {
          crewId: true,
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  const dbCounts: Record<string, { count: number; roleId: number }> = {};
  for (const role of roles) {
    dbCounts[role.displayName || role.code] = { count: role.CrewRole.length, roleId: role.id };
  }

  // Get latest logbook
  const latestLogbook = await prisma.logbook.findFirst({
    orderBy: { date: 'desc' },
    select: { id: true, date: true },
  });

  if (!latestLogbook) {
    console.log('No logbooks found');
    return;
  }

  console.log(`Latest logbook: ${latestLogbook.date}\n`);

  // Get RoleFairnessSnapshot data for this date
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: { date: latestLogbook.date },
    include: {
      Role: true,
    },
  });

  console.log('Role Name'.padEnd(25) + 'DB CrewRole'.padEnd(15) + 'Snapshot eligibleCrew'.padEnd(25) + 'Match?');
  console.log('-'.repeat(80));

  for (const snapshot of snapshots) {
    const roleName = snapshot.Role.displayName || snapshot.Role.code;
    const dbInfo = dbCounts[roleName];
    const dbCount = dbInfo?.count || 0;
    const snapshotEligible = snapshot.eligibleCrew;
    
    const match = dbCount === snapshotEligible ? '✅' : `❌ (diff: ${dbCount - snapshotEligible})`;
    
    console.log(
      `${roleName.padEnd(25)}${String(dbCount).padEnd(15)}${String(snapshotEligible).padEnd(25)}${match}`
    );
  }

  // Check if there are roles missing from snapshots
  console.log('\n\nRoles in DB but not in snapshot:');
  const snapshotRoleIds = new Set(snapshots.map(s => s.roleId));
  for (const [roleName, info] of Object.entries(dbCounts)) {
    if (!snapshotRoleIds.has(info.roleId) && info.count > 0) {
      console.log(`  ${roleName}: ${info.count} crew`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
});
