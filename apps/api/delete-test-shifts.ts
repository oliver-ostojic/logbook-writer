/**
 * Delete all test shifts for 2025-11-26
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testDate = new Date('2025-11-26');
  const storeId = 768;

  console.log('🗑️  Deleting test shifts for', testDate.toISOString().split('T')[0]);

  const result = await prisma.shift.deleteMany({
    where: {
      storeId,
      date: testDate,
    },
  });

  console.log(`✅ Deleted ${result.count} shifts`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
