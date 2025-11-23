import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleaning up test data...\n');
  
  // Get all test crew members
  const allCrews = await prisma.crew.findMany();
  const testCrews = allCrews.filter(c => 
    c.id.startsWith('PREF') || 
    c.id.startsWith('TCREW') || 
    c.id.startsWith('TUN') || 
    c.id.startsWith('TCRW')
  );
  
  console.log(`Found ${testCrews.length} test crew members to delete`);
  
  // Delete CrewRole relationships first (foreign key constraint)
  const deletedCrewRoles = await prisma.crewRole.deleteMany({
    where: {
      crewId: { in: testCrews.map(c => c.id) }
    }
  });
  console.log(`✓ Deleted ${deletedCrewRoles.count} CrewRole relationships`);
  
  // Delete CrewRoleRequirement relationships
  const deletedRequirements = await prisma.crewRoleRequirement.deleteMany({
    where: {
      crewId: { in: testCrews.map(c => c.id) }
    }
  });
  console.log(`✓ Deleted ${deletedRequirements.count} CrewRoleRequirement records`);
  
  // Delete Task assignments
  const deletedTasks = await prisma.task.deleteMany({
    where: {
      crewId: { in: testCrews.map(c => c.id) }
    }
  });
  console.log(`✓ Deleted ${deletedTasks.count} Task assignments`);
  
  // Delete crew members
  const deletedCrews = await prisma.crew.deleteMany({
    where: {
      id: { in: testCrews.map(c => c.id) }
    }
  });
  console.log(`✓ Deleted ${deletedCrews.count} test crew members`);
  
  // Get all test roles
  const allRoles = await prisma.role.findMany();
  const testRoles = allRoles.filter(r => 
    r.code.includes('Test') || 
    r.code.includes('_176') || // timestamp-based test roles
    r.displayName.includes('Test') ||
    r.displayName.includes('Duplicate')
  );
  
  console.log(`\nFound ${testRoles.length} test roles to delete`);
  
  // Delete CoverageWindow for test roles
  const deletedWindows = await prisma.coverageWindow.deleteMany({
    where: {
      roleId: { in: testRoles.map(r => r.id) }
    }
  });
  console.log(`✓ Deleted ${deletedWindows.count} CoverageWindow records`);
  
  // Delete test roles
  const deletedRoles = await prisma.role.deleteMany({
    where: {
      id: { in: testRoles.map(r => r.id) }
    }
  });
  console.log(`✓ Deleted ${deletedRoles.count} test roles`);
  
  console.log('\n✅ Test data cleanup complete!');
}

main()
  .catch((e) => {
    console.error('❌ Cleanup failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
