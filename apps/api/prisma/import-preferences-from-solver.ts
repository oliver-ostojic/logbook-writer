#!/usr/bin/env tsx
/**
 * Import preferences from solver input JSON
 */

import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';

const prisma = new PrismaClient();

async function main() {
  const solverInputPath = '../solver-python/solver_input_11_22_v5.json';
  
  console.log('📋 Importing preferences from solver input...\n');
  
  const raw = await readFile(solverInputPath, 'utf-8');
  const data = JSON.parse(raw);
  
  let rolePrefsCreated = 0;
  const errors: string[] = [];
  
  // Import preferences from the preferences array
  for (const pref of data.preferences || []) {
    const crew = await prisma.crew.findUnique({ where: { id: pref.crewId } });
    if (!crew) {
      errors.push(`Crew not found for preference: ${pref.crewId}`);
      continue;
    }
    
    const role = await prisma.role.findUnique({ where: { code: pref.role } });
    if (!role) {
      errors.push(`Role not found: ${pref.role}`);
      continue;
    }
    
    // Create CrewPreference entry
    const existing = await prisma.crewPreference.findUnique({
      where: {
        crewId_roleId: {
          crewId: crew.id,
          roleId: role.id,
        },
      },
    });
    
    if (!existing) {
      await prisma.crewPreference.create({
        data: {
          crewId: crew.id,
          roleId: role.id,
          weight: pref.weight,
        },
      });
      rolePrefsCreated++;
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   CrewPreferences created: ${rolePrefsCreated}`);
  if (errors.length > 0) {
    console.log(`   Errors: ${errors.length}`);
    errors.slice(0, 10).forEach(e => console.log(`     - ${e}`));
    if (errors.length > 10) {
      console.log(`     ... and ${errors.length - 10} more`);
    }
  }
  
  const totalCrewPrefs = await prisma.crewPreference.count();
  console.log(`\n   Total CrewPreferences in database: ${totalCrewPrefs}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
