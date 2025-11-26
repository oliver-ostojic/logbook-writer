#!/usr/bin/env tsx
/**
 * Rebuild database from scratch
 * Run in order: Store → Roles → Crew → Shifts → Constraints
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Rebuilding Database ===\n');

  // 1. Create Store
  console.log('1. Creating store 768 (Dr. Phillips)...');
  const store = await prisma.store.upsert({
    where: { id: 768 },
    update: {},
    create: {
      id: 768,
      name: 'Dr. Phillips',
      timezone: 'America/New_York',
      baseSlotMinutes: 30,
      openMinutesFromMidnight: 480,  // 8am
      closeMinutesFromMidnight: 1260, // 9pm
      reqShiftLengthForBreak: 360,    // 6 hours
      breakWindowStart: 180,          // 3 hours
      breakWindowEnd: 270,            // 4.5 hours
    },
  });
  console.log(`   ✓ Store ${store.id} - ${store.name}\n`);

  // 2. Create Roles with new assignment models
  console.log('2. Creating roles...');
  const roles = [
    { code: 'REGISTER', displayName: 'Register', assignmentModel: 'HOURLY' as const, minSlots: 4, maxSlots: 8, blockSize: 2 },
    { code: 'PRODUCT', displayName: 'Product', assignmentModel: 'HOURLY' as const, minSlots: 4, maxSlots: 8, blockSize: 1, allowOutsideStoreHours: true },
    { code: 'PARKING_HELM', displayName: 'Parking Helms', assignmentModel: 'HOURLY' as const, minSlots: 1, maxSlots: 1, blockSize: 1 },
    { code: 'BREAK', displayName: 'Break', assignmentModel: 'HOURLY' as const, minSlots: 1, maxSlots: 1, blockSize: 1, slotsMustBeConsecutive: true },
    { code: 'DEMO', displayName: 'Demo', assignmentModel: 'HOURLY_WINDOW' as const, minSlots: 0, maxSlots: 4, blockSize: 2 },
    { code: 'WINE_DEMO', displayName: 'Wine Demo', assignmentModel: 'HOURLY_WINDOW' as const, minSlots: 0, maxSlots: 4, blockSize: 2 },
    { code: 'ORDER_WRITER', displayName: 'Order Writer', assignmentModel: 'DAILY' as const, minSlots: 0, maxSlots: 4, blockSize: 1, slotsMustBeConsecutive: true },
    { code: 'ART', displayName: 'Art', assignmentModel: 'DAILY' as const, minSlots: 0, maxSlots: 8, blockSize: 1, slotsMustBeConsecutive: true },
  ];

  for (const roleData of roles) {
    const role = await prisma.role.upsert({
      where: { code: roleData.code },
      update: roleData,
      create: { ...roleData, storeId: 768 },
    });
    console.log(`   ✓ ${role.code.padEnd(15)} ${role.assignmentModel}`);
  }

  console.log('\n✅ Database rebuilt! Now run:');
  console.log('   - npx tsx prisma/add-crew.ts');
  console.log('   - npx tsx add-shifts-11-22.ts');
  console.log('   - npx tsx prisma/add-constraints-11-22.ts');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
