/**
 * Test script for crew rule satisfaction calculator
 * 
 * Tests the new CrewRoleRule-based preference satisfaction system
 */

import { PrismaClient } from '@prisma/client';
import {
  calculateCrewRuleSatisfaction,
  aggregateSatisfactionStats,
  saveLogPreferenceMetadata,
  getGrade,
  type AssignmentRecord,
  type CrewRoleRuleRecord,
  type CrewShiftWindow,
} from './src/services/crew-rule-satisfaction';

const prisma = new PrismaClient();

async function testSatisfaction() {
  const storeId = 768;
  const date = new Date('2025-11-25');

  console.log('🧪 Testing CrewRoleRule Satisfaction Calculator');
  console.log('================================================\n');

  // Get a recent logbook with assignments
  const logbook = await prisma.logbook.findFirst({
    where: { storeId, date },
    include: {
      Assignment: {
        include: {
          Crew: { select: { name: true } },
          Role: { select: { code: true, taskLength: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!logbook) {
    console.log('❌ No logbook found for store 768 on 2025-11-25');
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Logbook: ${logbook.id}`);
  console.log(`   Status: ${logbook.status}`);
  console.log(`   Assignments: ${logbook.Assignment.length}\n`);

  // Convert assignments to AssignmentRecord format
  const assignments: AssignmentRecord[] = logbook.Assignment.map(a => ({
    crewId: a.crewId,
    roleId: a.roleId,
    startMinutes: a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes(),
    endMinutes: a.endTime.getUTCHours() * 60 + a.endTime.getUTCMinutes(),
  }));

  // Get unique crew IDs from assignments
  const crewIds = [...new Set(assignments.map(a => a.crewId))];
  console.log(`👥 Crew in logbook: ${crewIds.length}`);

  // Fetch shifts for these crew
  const shifts = await prisma.shift.findMany({
    where: { storeId, date, crewId: { in: crewIds } }
  });

  // Build crew shift map
  const crewShifts = new Map<string, CrewShiftWindow>();
  for (const shift of shifts) {
    crewShifts.set(shift.crewId, {
      crewId: shift.crewId,
      shiftStartMin: shift.startMin,
      shiftEndMin: shift.endMin,
    });
  }
  console.log(`   Shifts found: ${crewShifts.size}\n`);

  // Fetch CrewRoleRules for these crew
  const crewRoleRules = await prisma.crewRoleRule.findMany({
    where: { crewId: { in: crewIds } },
    include: {
      RoleRule: {
        include: {
          Role: { select: { code: true } },
          TargetRole: { select: { code: true } }
        }
      },
      Crew: { select: { name: true } }
    }
  });

  console.log(`📜 CrewRoleRules found: ${crewRoleRules.length}`);
  
  // Count by type
  const byType = new Map<string, number>();
  for (const r of crewRoleRules) {
    const type = r.RoleRule.type;
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }
  console.log('   By type:');
  byType.forEach((count, type) => {
    console.log(`     ${type}: ${count}`);
  });
  console.log('');

  // Fetch role block sizes
  const roles = await prisma.role.findMany({
    where: { storeId },
    select: { id: true, code: true, taskLength: true }
  });
  const roleBlockSizes = new Map<number, number>();
  for (const role of roles) {
    roleBlockSizes.set(role.id, role.taskLength);
  }

  // Transform to our interface
  const crewRoleRuleRecords: CrewRoleRuleRecord[] = crewRoleRules.map(crr => ({
    id: crr.id,
    crewId: crr.crewId,
    roleRuleId: crr.roleRuleId,
    valueInt: crr.valueInt,
    roleRule: {
      id: crr.RoleRule.id,
      roleId: crr.RoleRule.roleId,
      type: crr.RoleRule.type,
      targetRoleId: crr.RoleRule.targetRoleId,
      constraintType: crr.RoleRule.constraintType,
    }
  }));

  // Calculate satisfaction
  console.log('⚡ Calculating satisfaction...\n');
  const results = calculateCrewRuleSatisfaction(
    crewRoleRuleRecords,
    assignments,
    crewShifts,
    roleBlockSizes
  );

  // Separate eligible vs ineligible
  // Eligible = result was returned (rule applied)
  // But we need to also check if the result indicates N/A
  const eligibleResults = results.filter(r => !r.details?.includes('Rule N/A'));
  const ineligibleResults = results.filter(r => r.details?.includes('Rule N/A'));

  console.log('📊 Eligibility Summary:');
  console.log('─'.repeat(50));
  console.log(`   Total CrewRoleRules: ${crewRoleRules.length}`);
  console.log(`   Results returned: ${results.length}`);
  console.log(`   Eligible (rule applied): ${eligibleResults.length}`);
  console.log(`   Ineligible (rule N/A): ${ineligibleResults.length}`);
  console.log('');

  // Show ELIGIBLE results only
  console.log('📊 ELIGIBLE Results (rule applied):');
  console.log('─'.repeat(80));
  
  for (const r of eligibleResults) {
    const crewName = crewRoleRules.find(crr => crr.id === r.crewRoleRuleId)?.Crew.name ?? 'Unknown';
    const roleCode = roles.find(role => role.id === r.roleId)?.code ?? `Role${r.roleId}`;
    const metStr = r.met ? '✅' : '❌';
    const satStr = `${(r.satisfaction * 100).toFixed(0)}%`.padStart(4);
    
    console.log(`${metStr} ${satStr} | ${crewName.padEnd(20)} | ${r.ruleType.padEnd(30)} | ${roleCode}`);
    if (r.details) {
      console.log(`        └─ ${r.details}`);
    }
  }
  console.log('');

  // Use the aggregation function
  const crewRoleRuleRecordsForStats = crewRoleRules.map(crr => ({
    id: crr.id,
    crewId: crr.crewId,
    roleRuleId: crr.roleRuleId,
    valueInt: crr.valueInt,
    roleRule: {
      id: crr.RoleRule.id,
      roleId: crr.RoleRule.roleId,
      type: crr.RoleRule.type,
      targetRoleId: crr.RoleRule.targetRoleId,
      constraintType: crr.RoleRule.constraintType,
    }
  }));

  const stats = aggregateSatisfactionStats(eligibleResults, crewRoleRuleRecordsForStats);

  console.log('📈 AGGREGATED STATISTICS:');
  console.log('═'.repeat(60));
  console.log('');
  console.log('  📊 Preference Satisfaction');
  console.log('  ─'.repeat(30));
  console.log(`     Eligible Preferences:  ${stats.eligiblePreferences}`);
  console.log(`     Preferences Met:       ${stats.preferencesMet} (${stats.percentMet.toFixed(1)}%) ${getGrade(stats.percentMet)}`);
  console.log(`     Avg Satisfaction:      ${stats.avgSatisfaction.toFixed(1)}% ${getGrade(stats.avgSatisfaction)}`);
  console.log('');
  console.log('  👥 Crew Metrics');
  console.log('  ─'.repeat(30));
  console.log(`     Eligible Crew:         ${stats.eligibleCrew}`);
  console.log(`     Avg Sat Per Crew:      ${stats.avgSatisfactionPerCrew.toFixed(1)}% ${getGrade(stats.avgSatisfactionPerCrew)}`);
  console.log('');
  console.log('  ⚖️  Fairness');
  console.log('  ─'.repeat(30));
  console.log(`     Fairness Index:        ${stats.fairnessIndex.toFixed(1)} ${stats.fairnessGrade}`);
  console.log('');
  console.log('  📋 Breakdown by RoleRule:');
  console.log('  ─'.repeat(30));
  
  for (const breakdown of stats.breakdownByRoleRule) {
    const grade = getGrade(breakdown.percentMet);
    console.log(`     RoleRule ${breakdown.roleRuleId.toString().padEnd(3)} (${breakdown.ruleType.padEnd(28)}) ${breakdown.met}/${breakdown.eligible} met (${breakdown.percentMet.toFixed(1)}%) ${grade}`);
  }

  console.log('');
  console.log('═'.repeat(60));

  // Save to database
  console.log('\n💾 Saving to LogPreferenceMetadata...');
  await saveLogPreferenceMetadata(prisma, logbook.id, stats);
  
  // Verify it was saved
  const saved = await prisma.logPreferenceMetadata.findUnique({
    where: { logbookId: logbook.id }
  });
  
  if (saved) {
    console.log('✅ Saved successfully!');
    console.log(`   ID: ${saved.id}`);
    console.log(`   Fairness Grade: ${saved.fairnessGrade}`);
    console.log(`   Breakdown: ${JSON.stringify(saved.breakdownByRoleRule).substring(0, 80)}...`);
  } else {
    console.log('❌ Failed to save!');
  }

  console.log('\n✅ Test complete!');
  await prisma.$disconnect();
}

testSatisfaction().catch(console.error);
