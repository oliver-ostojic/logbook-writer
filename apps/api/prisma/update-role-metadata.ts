/**
 * Update existing roles with assignmentMode and isConsecutive flags
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating role metadata...');

  // Team window roles (scheduled via coverage windows)
  const teamWindowRoles = [
    { name: 'DEMO', isConsecutive: false },
    { name: 'WINE_DEMO', isConsecutive: false },
  ];

  for (const role of teamWindowRoles) {
    const updated = await prisma.role.updateMany({
      where: { name: role.name },
      data: {
        assignmentMode: 'TEAM_WINDOW',
        isConsecutive: role.isConsecutive,
      },
    });
    console.log(`  ✓ ${role.name}: TEAM_WINDOW, consecutive=${role.isConsecutive} (${updated.count} rows)`);
  }

  // Individual hours roles (per-person requirements)
  const individualRoles = [
    { name: 'ART', isConsecutive: true },           // Art team should have consecutive blocks
    { name: 'ORDER_WRITER', isConsecutive: true },  // Order writer should have consecutive blocks
    { name: 'TRUCK', isConsecutive: true },         // Truck unloading should be consecutive
    { name: 'REGISTER', isConsecutive: false },     // Register can be split
    { name: 'PRODUCT', isConsecutive: false },      // Product can be split
    { name: 'PARKING_HELM', isConsecutive: false }, // Parking can be split
    { name: 'MEAL_BREAK', isConsecutive: true },    // Breaks should be consecutive
  ];

  for (const role of individualRoles) {
    const updated = await prisma.role.updateMany({
      where: { name: role.name },
      data: {
        assignmentMode: 'INDIVIDUAL_HOURS',
        isConsecutive: role.isConsecutive,
      },
    });
    console.log(`  ✓ ${role.name}: INDIVIDUAL_HOURS, consecutive=${role.isConsecutive} (${updated.count} rows)`);
  }

  console.log('\nDone! All roles updated.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
