/**
 * Add Sammi's shift for 11/22/25
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const crew = await prisma.crew.findFirst({
    where: {
      storeId: 768,
      name: { contains: 'Sammi', mode: 'insensitive' }
    }
  });
  
  if (!crew) {
    console.log('❌ Sammi not found');
    return;
  }
  
  console.log(`Found: ${crew.name} (${crew.id})`);
  
  const shift = await prisma.shift.create({
    data: {
      date: new Date('2025-11-22'),
      crewId: crew.id,
      storeId: 768,
      startMin: 10 * 60,  // 10 am
      endMin: 18 * 60,    // 6 pm
    }
  });
  
  console.log(`✅ Added shift for ${crew.name}: 10:00 - 18:00`);
  
  const total = await prisma.shift.count({
    where: { storeId: 768, date: new Date('2025-11-22') }
  });
  
  console.log(`📊 Total shifts for 11/22/25: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
