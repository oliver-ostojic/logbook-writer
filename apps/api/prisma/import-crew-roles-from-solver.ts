#!/usr/bin/env tsx
/**
 * Import CrewRole assignments from solver input JSON
 */

import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';

const prisma = new PrismaClient();

async function main() {
  const solverInputPath = '../solver-python/solver_input_11_22_v5.json';
  
  console.log('📋 Importing CrewRole assignments from solver input...\n');
  
  const raw = await readFile(solverInputPath, 'utf-8');
  const data = JSON.parse(raw);
  
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  
  for (const crewData of data.crew) {
    const crew = await prisma.crew.findUnique({ where: { id: crewData.id } });
    if (!crew) {
      errors.push(`Crew not found: ${crewData.name} (${crewData.id})`);
      continue;
    }
    
    for (const roleCode of crewData.eligibleRoles || []) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) {
        errors.push(`Role not found: ${roleCode}`);
        continue;
      }
      
      // Check if already exists
      const existing = await prisma.crewRole.findUnique({
        where: {
          crewId_roleId: {
            crewId: crew.id,
            roleId: role.id,
          },
        },
      });
      
      if (existing) {
        skipped++;
        continue;
      }
      
      await prisma.crewRole.create({
        data: {
          crewId: crew.id,
          roleId: role.id,
          crewName: crew.name,
          roleName: role.code,
        },
      });
      created++;
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped (already exist): ${skipped}`);
  if (errors.length > 0) {
    console.log(`   Errors: ${errors.length}`);
    errors.slice(0, 10).forEach(e => console.log(`     - ${e}`));
    if (errors.length > 10) {
      console.log(`     ... and ${errors.length - 10} more`);
    }
  }
  
  const totalCrewRoles = await prisma.crewRole.count();
  console.log(`\n   Total CrewRoles in database: ${totalCrewRoles}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
