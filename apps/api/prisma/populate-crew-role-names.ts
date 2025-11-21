import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Populating crewName and roleName for existing CrewRole records...\n');
  
  // Get all CrewRole records
  const crewRoles = await prisma.crewRole.findMany({
    include: {
      Crew: true,
      Role: true
    }
  });
  
  console.log(`Found ${crewRoles.length} CrewRole records to update\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const crewRole of crewRoles) {
    // Check if already populated
    if (crewRole.crewName && crewRole.roleName) {
      console.log(`⊘ Skipping ${crewRole.Crew.name} → ${crewRole.Role.displayName} (already populated)`);
      skipped++;
      continue;
    }
    
    try {
      await prisma.crewRole.update({
        where: {
          crewId_roleId: {
            crewId: crewRole.crewId,
            roleId: crewRole.roleId
          }
        },
        data: {
          crewName: crewRole.Crew.name,
          roleName: crewRole.Role.displayName
        }
      });
      
      console.log(`✓ Updated ${crewRole.Crew.name} → ${crewRole.Role.displayName}`);
      updated++;
    } catch (error: any) {
      console.error(`✗ Failed to update ${crewRole.Crew.name} → ${crewRole.Role.displayName}:`, error.message);
    }
  }
  
  console.log(`\n✅ Complete! Updated ${updated} records, skipped ${skipped} already populated`);
}

main()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
