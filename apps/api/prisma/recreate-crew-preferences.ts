#!/usr/bin/env tsx
/**
 * Recreate CrewPreferences from solver input
 */

import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';

const prisma = new PrismaClient();

async function main() {
  const solverInputPath = '../solver-python/solver_input_11_22_v5.json';
  
  console.log('📋 Recreating CrewPreferences from solver input...\n');
  
  const raw = await readFile(solverInputPath, 'utf-8');
  const data = JSON.parse(raw);
  
  // Get all RolePreferences to map them
  const rolePrefs = await prisma.rolePreference.findMany({
    include: { role: true },
  });
  
  // Build a map: (roleCode, preferenceType) -> rolePreferenceId
  const prefMap = new Map<string, number>();
  for (const rp of rolePrefs) {
    const key = `${rp.role?.code || 'null'}_${rp.preferenceType}`;
    prefMap.set(key, rp.id);
  }
  
  console.log(`Found ${rolePrefs.length} RolePreferences to match against\n`);
  
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  
  for (const pref of data.preferences || []) {
    const crew = await prisma.crew.findUnique({ where: { id: pref.crewId } });
    if (!crew) {
      errors.push(`Crew not found: ${pref.crewId}`);
      continue;
    }
    
    // Find the matching RolePreference
    const key = `${pref.roleCode}_${pref.preferenceType}`;
    const rolePreferenceId = prefMap.get(key);
    
    if (!rolePreferenceId) {
      errors.push(`RolePreference not found for: ${key}`);
      continue;
    }
    
    // Check if already exists
    const existing = await prisma.crewPreference.findFirst({
      where: {
        crewId: pref.crewId,
        rolePreferenceId: rolePreferenceId,
      },
    });
    
    if (existing) {
      skipped++;
      continue;
    }
    
    await prisma.crewPreference.create({
      data: {
        crewId: pref.crewId,
        rolePreferenceId: rolePreferenceId,
        crewWeight: pref.crewWeight || 1,
        intValue: pref.intValue || null,
      },
    });
    created++;
    
    if (created % 50 === 0) {
      console.log(`   Created ${created} preferences...`);
    }
  }
  
  console.log(`\n✅ Recreation complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  if (errors.length > 0) {
    console.log(`   Errors: ${errors.length}`);
    const uniqueErrors = [...new Set(errors)];
    uniqueErrors.slice(0, 10).forEach(e => console.log(`     - ${e}`));
    if (uniqueErrors.length > 10) {
      console.log(`     ... and ${uniqueErrors.length - 10} more unique errors`);
    }
  }
  
  const total = await prisma.crewPreference.count();
  console.log(`\n   Total CrewPreferences in database: ${total}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
