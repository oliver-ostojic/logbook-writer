import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking RoleFairnessTracker records...\n');
  
  const trackers = await prisma.roleFairnessTracker.findMany();
  
  if (trackers.length === 0) {
    console.log('No fairness trackers found. Creating one for testing...\n');
    
    // Get a role to track (use raw query to find role)
    const roles = await prisma.$queryRaw<Array<{id: number, name: string}>>`SELECT id, name FROM "Role" WHERE name ILIKE '%register%' LIMIT 1`;
    
    if (roles.length > 0) {
      const store = await prisma.store.findFirst();
      if (store) {
        const newTracker = await prisma.roleFairnessTracker.create({
          data: {
            storeId: store.id,
            roleId: roles[0].id,
            lookbackDays: 14,
            enabled: true,
          },
        });
        console.log('Created tracker:', newTracker);
      }
    }
  } else {
    console.log('Found trackers:', trackers);
  }
  
  // Check history
  console.log('\nChecking CrewRoleFairnessHistory...');
  const historyCount = await prisma.crewRoleFairnessHistory.count();
  console.log(`  Found ${historyCount} history records`);
  
  // Check snapshots
  console.log('\nChecking RoleFairnessSnapshot...');
  const snapshotCount = await prisma.roleFairnessSnapshot.count();
  console.log(`  Found ${snapshotCount} snapshot records`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
