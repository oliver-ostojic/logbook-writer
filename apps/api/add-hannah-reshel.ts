/**
 * Add Hannah Reshel to store 768 with specified roles
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  
  // Generate a 7-char crew ID
  const crewId = 'HRESHEL';
  
  // Role IDs for store 768:
  // 29: Parking Helms, 30: Register, 33: Product, 35: Section Leader, 36: Break, 38: Food Demo
  const roleIds = [30, 33, 29, 38, 36, 35]; // Register, Product, Parking Helms, Demo, Break, Section Leader
  
  console.log('Creating crew member Hannah Reshel...');
  
  // Check if already exists
  const existing = await prisma.crew.findFirst({
    where: { storeId, name: { contains: 'Hannah', mode: 'insensitive' } }
  });
  
  if (existing) {
    console.log(`⚠️  Hannah already exists: ${existing.id}`);
    return;
  }
  
  // Create crew with roles
  const crew = await prisma.crew.create({
    data: {
      id: crewId,
      name: 'Hannah Reshel',
      storeId,
      CrewRole: {
        create: roleIds.map(roleId => ({ 
          roleId,
          crewName: 'Hannah Reshel',
          roleName: '' // Will be overwritten by relation
        }))
      }
    },
    include: {
      CrewRole: {
        include: { Role: true }
      }
    }
  });
  
  console.log(`✅ Created: ${crew.name} (${crew.id})`);
  console.log('   Roles:');
  crew.CrewRole.forEach(cr => {
    console.log(`     - ${cr.Role.displayName} (${cr.Role.code})`);
  });
  
  const totalCrew = await prisma.crew.count({ where: { storeId } });
  console.log(`\n📊 Total crew in store ${storeId}: ${totalCrew}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
