/**
 * Example: Creating roles with detail/variant subtypes
 * 
 * This demonstrates how to use the new role.detail field for
 * more granular role specifications.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createRoleWithDetails() {
  console.log('Creating roles with detail variants...\n');

  // Example 1: ORDER_WRITER with bread variant
  const orderWriterBread = await prisma.role.create({
    data: {
      name: 'ORDER_WRITER',
      assignmentMode: 'INDIVIDUAL_HOURS',
      isConsecutive: true,
      detail: 'bread',
    },
  });
  console.log('✓ Created ORDER_WRITER (bread variant)');

  // Example 2: ORDER_WRITER with cold_produce variant
  const orderWriterProduce = await prisma.role.create({
    data: {
      name: 'ORDER_WRITER',
      assignmentMode: 'INDIVIDUAL_HOURS',
      isConsecutive: true,
      detail: 'cold_produce',
    },
  });
  console.log('✓ Created ORDER_WRITER (cold_produce variant)');

  // Example 3: ART with signs variant
  const artSigns = await prisma.role.create({
    data: {
      name: 'ART',
      assignmentMode: 'INDIVIDUAL_HOURS',
      isConsecutive: true,
      detail: 'signs',
    },
  });
  console.log('✓ Created ART (signs variant)');

  // Example 4: ART with decor variant
  const artDecor = await prisma.role.create({
    data: {
      name: 'ART',
      assignmentMode: 'INDIVIDUAL_HOURS',
      isConsecutive: true,
      detail: 'decor',
    },
  });
  console.log('✓ Created ART (decor variant)');

  console.log('\nRole details allow for:');
  console.log('- More specific reporting (e.g., "Alice did ORDER_WRITER (bread) for 2 hours")');
  console.log('- Future preference support (e.g., crew prefers ART (signs) over ART (decor))');
  console.log('- Better constraint modeling (e.g., store needs 1 ORDER_WRITER (bread) and 1 ORDER_WRITER (produce))');
}

// Note: This is just an example. Don't run this script as it will create duplicate roles.
// The pattern shown here can be used in your own seed scripts or admin tools.

export { createRoleWithDetails };
