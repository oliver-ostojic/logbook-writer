/**
 * Debug LIKE_ROLE_FOR_HOUR_X satisfaction calculation
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  const testDate = new Date('2025-12-15');
  
  console.log('='.repeat(80));
  console.log('DEBUG: LIKE_ROLE_FOR_HOUR_X Satisfaction');
  console.log('='.repeat(80));
  
  // Get the logbook
  const logbook = await prisma.logbook.findFirst({
    where: { storeId, date: testDate },
    include: {
      Assignment: {
        include: { Crew: true, Role: true }
      }
    }
  });
  
  if (!logbook) {
    console.log('No logbook found for', testDate);
    return;
  }
  
  console.log(`\nLogbook: ${logbook.id} (${logbook.date.toISOString().split('T')[0]})`);
  console.log(`Total assignments: ${logbook.Assignment.length}`);
  
  // Get LIKE_ROLE_FOR_HOUR_X rules (roleRuleId 22 = REG, 24 = PROD, 26 = ART, 28 = SL)
  const hourLikeRuleIds = [22, 24, 26, 28];
  
  const crewRoleRules = await prisma.crewRoleRule.findMany({
    where: {
      roleRuleId: { in: hourLikeRuleIds },
      Crew: { storeId }
    },
    include: {
      Crew: true,
      RoleRule: true
    }
  });
  
  console.log(`\nFound ${crewRoleRules.length} LIKE_ROLE_FOR_HOUR_X rules\n`);
  
  // Sample a few to check
  const sampleRules = crewRoleRules.slice(0, 10);
  
  for (const rule of sampleRules) {
    const crewId = rule.crewId;
    const roleId = rule.RoleRule.roleId;
    const shiftRelativeMinutes = rule.valueInt ?? 0;  // Minutes from START of shift
    
    // Get this crew's assignments
    const crewAssignments = logbook.Assignment.filter(a => a.crewId === crewId);
    
    // Check if crew is even working
    if (crewAssignments.length === 0) {
      console.log(`${rule.Crew.name}: NOT WORKING (no assignments)`);
      continue;
    }
    
    // Convert assignments to minutes from midnight
    const assignmentsWithMinutes = crewAssignments.map(a => {
      const startMinutes = a.startTime.getHours() * 60 + a.startTime.getMinutes();
      const endMinutes = a.endTime.getHours() * 60 + a.endTime.getMinutes();
      return {
        roleId: a.roleId,
        roleName: a.Role.displayName,
        startMinutes,
        endMinutes
      };
    });
    
    // Get shift window
    const firstStart = assignmentsWithMinutes[0]?.startMinutes ?? 0;
    const lastEnd = assignmentsWithMinutes[assignmentsWithMinutes.length-1]?.endMinutes ?? 0;
    
    // Convert valueInt (relative to shift) to absolute time
    const absoluteHourStart = firstStart + shiftRelativeMinutes;
    const absoluteHourEnd = absoluteHourStart + 60;
    
    // Check if this hour is within the crew's shift
    if (absoluteHourStart >= lastEnd) {
      console.log(`\n${rule.Crew.name}:`);
      console.log(`  Rule: LIKE role ${roleId} during shift minute ${shiftRelativeMinutes}-${shiftRelativeMinutes + 60}`);
      console.log(`  Shift: ${firstStart}m - ${lastEnd}m`);
      console.log(`  ⚠️  TARGET HOUR ${absoluteHourStart}-${absoluteHourEnd} IS BEYOND SHIFT END`);
      continue;
    }
    
    // Find what was assigned during the target hour (now using absolute time)
    const duringTargetHour = assignmentsWithMinutes.filter(a => 
      a.startMinutes < absoluteHourEnd && a.endMinutes > absoluteHourStart
    );
    
    // Check if the preferred role was assigned
    const preferredRoleAssigned = duringTargetHour.some(a => a.roleId === roleId);

    console.log(`\n${rule.Crew.name}:`);
    console.log(`  Rule: LIKE role ${roleId} during shift min ${shiftRelativeMinutes}-${shiftRelativeMinutes + 60} (absolute: ${absoluteHourStart}-${absoluteHourEnd})`);
    console.log(`  Shift: ${firstStart}m - ${lastEnd}m`);
    console.log(`  During target hour: ${duringTargetHour.map(a => `${a.roleName}(${a.startMinutes}-${a.endMinutes})`).join(', ') || 'NONE'}`);
    console.log(`  Preferred role (${roleId}) assigned? ${preferredRoleAssigned ? '✅ YES' : '❌ NO'}`);
  }
  
  // Summary stats
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY: All LIKE_ROLE_FOR_HOUR_X rules');
  console.log('='.repeat(80));
  
  let satisfied = 0;
  let notWorking = 0;
  let outsideShift = 0;
  let wrongRole = 0;
  
  for (const rule of crewRoleRules) {
    const crewId = rule.crewId;
    const roleId = rule.RoleRule.roleId;
    const shiftRelativeMin = rule.valueInt ?? 0;  // Minutes from shift start
    
    const crewAssignments = logbook.Assignment.filter(a => a.crewId === crewId);
    
    if (crewAssignments.length === 0) {
      notWorking++;
      continue;
    }
    
    const assignmentsWithMinutes = crewAssignments.map(a => ({
      roleId: a.roleId,
      startMinutes: a.startTime.getHours() * 60 + a.startTime.getMinutes(),
      endMinutes: a.endTime.getHours() * 60 + a.endTime.getMinutes()
    }));
    
    const shiftStart = assignmentsWithMinutes[0]?.startMinutes ?? 0;
    const shiftEnd = assignmentsWithMinutes[assignmentsWithMinutes.length-1]?.endMinutes ?? 0;
    
    // Convert to absolute time
    const absoluteHourStart = shiftStart + shiftRelativeMin;
    const absoluteHourEnd = absoluteHourStart + 60;
    
    // Check if this hour is within the crew's shift
    if (absoluteHourStart >= shiftEnd) {
      outsideShift++;
      continue;
    }
    
    const duringTargetHour = assignmentsWithMinutes.filter(a => 
      a.startMinutes < absoluteHourEnd && a.endMinutes > absoluteHourStart
    );
    
    const preferredRoleAssigned = duringTargetHour.some(a => a.roleId === roleId);
    
    if (preferredRoleAssigned) {
      satisfied++;
    } else {
      wrongRole++;
    }
  }
  
  console.log(`\nTotal rules: ${crewRoleRules.length}`);
  console.log(`Not working: ${notWorking}`);
  console.log(`Outside shift: ${outsideShift} (target hour beyond shift end)`);
  console.log(`Wrong role assigned: ${wrongRole}`);
  console.log(`Satisfied: ${satisfied}`);
  
  const applicable = crewRoleRules.length - notWorking - outsideShift;
  const satRate = applicable > 0 ? (satisfied / applicable * 100).toFixed(1) : 'N/A';
  console.log(`\nApplicable rules: ${applicable}`);
  console.log(`Satisfaction rate: ${satRate}%`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
