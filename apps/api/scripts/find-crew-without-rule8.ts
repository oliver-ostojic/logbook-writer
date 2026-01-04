#!/usr/bin/env npx ts-node
/**
 * Find crew members without a MAX_CONSECUTIVE_MINUTES rule (roleRuleId = 8)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all crew
  const allCrew = await prisma.crew.findMany({ select: { id: true, name: true } });
  
  // Get crew who have roleRuleId = 8
  const crewWithRule8 = await prisma.crewRoleRule.findMany({
    where: { roleRuleId: 8 },
    select: { crewId: true }
  });
  
  const crewIdsWithRule8 = new Set(crewWithRule8.map(r => r.crewId));
  
  // Find crew without the rule
  const crewWithout = allCrew.filter(c => !crewIdsWithRule8.has(c.id));
  
  console.log('Total crew:', allCrew.length);
  console.log('Crew with roleRuleId=8:', crewIdsWithRule8.size);
  console.log('Crew WITHOUT roleRuleId=8:', crewWithout.length);
  console.log('');
  
  if (crewWithout.length > 0) {
    console.log('Crew missing roleRuleId=8 (MAX_CONSECUTIVE_MINUTES):');
    crewWithout.forEach(c => console.log('  ', c.id, '-', c.name));
  } else {
    console.log('All crew have roleRuleId=8!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
