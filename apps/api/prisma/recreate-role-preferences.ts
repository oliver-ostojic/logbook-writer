#!/usr/bin/env tsx
/**
 * Recreate RolePreferences from solver input
 */

import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';

const prisma = new PrismaClient();

async function main() {
  const solverInputPath = '../solver-python/solver_input_11_22_v5.json';
  
  console.log('📋 Recreating RolePreferences from solver input...\n');
  
  const raw = await readFile(solverInputPath, 'utf-8');
  const data = JSON.parse(raw);
  
  // Extract unique role preferences
  const uniquePrefs = new Map<number, any>();
  for (const pref of data.preferences || []) {
    if (!uniquePrefs.has(pref.rolePreferenceId)) {
      uniquePrefs.set(pref.rolePreferenceId, pref);
    }
  }
  
  console.log(`Found ${uniquePrefs.size} unique RolePreferences\n`);
  
  const store = await prisma.store.findUnique({ where: { id: 768 } });
  if (!store) {
    console.error('❌ Store 768 not found');
    process.exit(1);
  }
  
  let created = 0;
  const errors: string[] = [];
  
  for (const [id, pref] of Array.from(uniquePrefs.entries()).sort((a, b) => a[0] - b[0])) {
    let roleId: number | null = null;
    
    if (pref.roleCode && pref.roleCode !== 'BREAK') {
      const role = await prisma.role.findUnique({ where: { code: pref.roleCode } });
      if (!role) {
        errors.push(`Role not found: ${pref.roleCode}`);
        continue;
      }
      roleId = role.id;
    }
    
    // Check if already exists
    const existing = await prisma.rolePreference.findFirst({
      where: {
        storeId: 768,
        roleId: roleId,
        preferenceType: pref.preferenceType,
      },
    });
    
    if (existing) {
      console.log(`⏭️  Skipped: ${pref.preferenceType} on ${pref.roleCode || 'generic'} (already exists)`);
      continue;
    }
    
    await prisma.rolePreference.create({
      data: {
        storeId: 768,
        roleId: roleId,
        preferenceType: pref.preferenceType,
        baseWeight: pref.baseWeight,
      },
    });
    
    console.log(`✅ Created: ${pref.preferenceType.padEnd(15)} on ${(pref.roleCode || 'generic').padEnd(15)} (weight: ${pref.baseWeight})`);
    created++;
  }
  
  console.log(`\n✅ Recreation complete!`);
  console.log(`   Created: ${created}`);
  if (errors.length > 0) {
    console.log(`   Errors: ${errors.length}`);
    errors.forEach(e => console.log(`     - ${e}`));
  }
  
  const total = await prisma.rolePreference.count();
  console.log(`\n   Total RolePreferences in database: ${total}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
