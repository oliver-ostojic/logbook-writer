#!/usr/bin/env npx ts-node
/**
 * Fix CrewRoleRule isPriority flag.
 * 
 * All CrewRoleRules should have isPriority = true, but they were created with false.
 * This script updates them all to true.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking CrewRoleRules with isPriority = false...\n');

  // Count current state
  const falseCount = await prisma.crewRoleRule.count({
    where: { isPriority: false },
  });

  const trueCount = await prisma.crewRoleRule.count({
    where: { isPriority: true },
  });

  const totalCount = await prisma.crewRoleRule.count();

  console.log(`📊 Current state:`);
  console.log(`   Total CrewRoleRules: ${totalCount}`);
  console.log(`   isPriority = true:   ${trueCount}`);
  console.log(`   isPriority = false:  ${falseCount}`);
  console.log('');

  if (falseCount === 0) {
    console.log('✅ All CrewRoleRules already have isPriority = true. Nothing to do!');
    return;
  }

  // Update all to true
  console.log(`🔄 Updating ${falseCount} CrewRoleRules to isPriority = true...`);

  const result = await prisma.crewRoleRule.updateMany({
    where: { isPriority: false },
    data: { isPriority: true },
  });

  console.log(`✅ Updated ${result.count} CrewRoleRules to isPriority = true`);

  // Verify
  const newFalseCount = await prisma.crewRoleRule.count({
    where: { isPriority: false },
  });

  if (newFalseCount === 0) {
    console.log('✅ Verified: All CrewRoleRules now have isPriority = true');
  } else {
    console.log(`⚠️  Warning: ${newFalseCount} CrewRoleRules still have isPriority = false`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
