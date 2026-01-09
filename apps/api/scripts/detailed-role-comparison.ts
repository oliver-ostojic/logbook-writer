import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 Detailed comparison: DB CrewRole vs RoleFairnessSnapshot\n');

  // Get database counts from CrewRole
  const roles = await prisma.role.findMany({
    include: {
      CrewRole: {
        include: {
          Crew: { select: { name: true } },
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  // Get all snapshots for all dates
  const allSnapshots = await prisma.roleFairnessSnapshot.findMany({
    include: {
      Role: true,
    },
    orderBy: [{ date: 'desc' }, { roleId: 'asc' }],
  });

  // Group snapshots by date
  const snapshotsByDate = new Map<string, typeof allSnapshots>();
  for (const s of allSnapshots) {
    const dateKey = s.date.toISOString().split('T')[0];
    if (!snapshotsByDate.has(dateKey)) {
      snapshotsByDate.set(dateKey, []);
    }
    snapshotsByDate.get(dateKey)!.push(s);
  }

  console.log('Snapshot dates found:', Array.from(snapshotsByDate.keys()));

  // Focus on roles that should appear in dashboard
  const enforcedRoles = roles.filter(r => 
    !['Break', 'Product', 'Register'].includes(r.displayName)
  );

  console.log('\n\nRoles with CrewRole assignments (current DB state):');
  console.log('Role Name'.padEnd(25) + 'Crew Count'.padEnd(15) + 'Crew Names (first 5)');
  console.log('-'.repeat(90));

  for (const role of enforcedRoles) {
    const crewNames = role.CrewRole.slice(0, 5).map(cr => cr.Crew.name).join(', ');
    const more = role.CrewRole.length > 5 ? ` (+${role.CrewRole.length - 5} more)` : '';
    console.log(`${role.displayName.padEnd(25)}${String(role.CrewRole.length).padEnd(15)}${crewNames}${more}`);
  }

  // Check for crew who were in snapshot but not in current DB
  const latestDate = Array.from(snapshotsByDate.keys())[0];
  const latestSnapshots = snapshotsByDate.get(latestDate) || [];
  
  console.log(`\n\nComparing latest snapshot (${latestDate}) vs current DB:`);
  
  for (const snapshot of latestSnapshots) {
    const role = roles.find(r => r.id === snapshot.roleId);
    if (!role) continue;
    
    const currentCount = role.CrewRole.length;
    const snapshotCount = snapshot.eligibleCrew;
    
    if (currentCount !== snapshotCount) {
      console.log(`\n${role.displayName}: DB=${currentCount}, Snapshot=${snapshotCount} (diff: ${currentCount - snapshotCount})`);
      console.log(`  Snapshot was created: ${snapshot.createdAt}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
});
