/**
 * Generate solver input for 11-25 by reading shifts from database
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = '2025-11-25';

async function main() {
  console.log('📋 Generating solver input for 2025-11-25\n');

  const date = new Date(TEST_DATE);
  date.setUTCHours(0, 0, 0, 0);

  // Get all shifts for this date
  const shifts = await prisma.shift.findMany({
    where: { storeId: STORE_ID, date },
    include: { crew: true },
    orderBy: { startTime: 'asc' }
  });

  console.log(`   Found ${shifts.length} shifts in database\n`);

  if (shifts.length === 0) {
    console.log('   ⚠️  No shifts found. Make sure to run add-shifts-11-25.ts first\n');
    return;
  }

  // Format shifts for API
  const shiftsForApi = shifts.map(s => {
    const startHour = s.startTime.getHours();
    const startMin = s.startTime.getMinutes();
    const endHour = s.endTime.getHours();
    const endMin = s.endTime.getMinutes();
    
    return {
      crewId: s.crewId,
      name: s.crew.name,
      start: `${startHour}:${String(startMin).padStart(2, '0')}`,
      end: `${endHour}:${String(endMin).padStart(2, '0')}`,
    };
  });

  console.log('   Sample shifts:');
  for (const shift of shiftsForApi.slice(0, 5)) {
    console.log(`      ${shift.name.padEnd(25)} ${shift.start.padStart(5)} - ${shift.end.padStart(5)}`);
  }
  console.log(`      ... and ${shiftsForApi.length - 5} more\n`);

  // Save for the run script
  const outputPath = path.join(process.cwd(), 'shifts_11_25.json');
  fs.writeFileSync(outputPath, JSON.stringify(shiftsForApi, null, 2));
  console.log(`   💾 Saved shifts to: ${outputPath}\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
