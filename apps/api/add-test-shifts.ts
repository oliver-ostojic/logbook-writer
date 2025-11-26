/**
 * Add test shift data for 2025-11-26
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testDate = new Date('2025-11-26');
  const storeId = 768;

  console.log('📅 Adding test shifts for', testDate.toISOString().split('T')[0]);

  // Get all crew
  const crew = await prisma.crew.findMany({
    where: { storeId },
  });

  console.log(`Found ${crew.length} crew members`);

  // Add shifts for each crew (sample: 8am-5pm)
  let created = 0;
  for (const c of crew) {
    try {
      await prisma.shift.create({
        data: {
          date: testDate,
          crewId: c.id,
          storeId,
          startMin: 8 * 60,  // 8:00 AM
          endMin: 17 * 60,   // 5:00 PM
        },
      });
      created++;
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`   Shift already exists for ${c.name}`);
      } else {
        console.error(`   Error creating shift for ${c.name}:`, error.message);
      }
    }
  }

  console.log(`✅ Created ${created} shifts`);

  // Verify
  const shifts = await prisma.shift.findMany({
    where: {
      storeId,
      date: testDate,
    },
    include: {
      crew: true,
    },
  });

  console.log(`\n📊 Total shifts for ${testDate.toISOString().split('T')[0]}: ${shifts.length}`);
  shifts.slice(0, 5).forEach((s) => {
    console.log(`   - ${s.crew.name}: ${s.startMin / 60}:00 - ${s.endMin / 60}:00`);
  });
  if (shifts.length > 5) {
    console.log(`   ... and ${shifts.length - 5} more`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
