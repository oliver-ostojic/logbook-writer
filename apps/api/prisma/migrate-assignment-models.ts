#!/usr/bin/env tsx
/**
 * Migrate assignment models from old naming to new naming:
 * - UNIVERSAL → HOURLY (roles with hourly staffing requirements)
 * - COVERAGE_WINDOW → HOURLY_WINDOW (hourly staffing in time windows)
 * - CREW_SPECIFIC → DAILY (per-crew daily requirements)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIGRATIONS = [
  { from: 'UNIVERSAL', to: 'HOURLY' },
  { from: 'COVERAGE_WINDOW', to: 'HOURLY_WINDOW' },
  { from: 'CREW_SPECIFIC', to: 'DAILY' },
] as const;

async function main() {
  console.log('\n=== Migrating Assignment Models ===\n');

  for (const { from, to } of MIGRATIONS) {
    const roles = await prisma.role.findMany({
      where: { assignmentModel: from as any },
      select: { id: true, code: true, displayName: true },
    });

    if (roles.length === 0) {
      console.log(`✓ No roles with ${from}`);
      continue;
    }

    console.log(`\nMigrating ${from} → ${to}:`);
    for (const role of roles) {
      console.log(`  - ${role.code.padEnd(15)} (${role.displayName})`);
    }

    const result = await prisma.role.updateMany({
      where: { assignmentModel: from as any },
      data: { assignmentModel: to as any },
    });

    console.log(`  ✓ Updated ${result.count} role(s)\n`);
  }

  console.log('\n=== Migration Complete ===\n');

  // Show final state
  const allRoles = await prisma.role.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, assignmentModel: true },
  });

  console.log('Final role assignment models:');
  allRoles.forEach((r) => {
    console.log(`  ${r.code.padEnd(15)} ${r.assignmentModel}`);
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
