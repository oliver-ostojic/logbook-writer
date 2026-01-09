/**
 * Check LogPreferenceMetadata for satisfaction data
 *
 * This script queries recent logbooks and checks if breakdownByCrew data exists
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking LogPreferenceMetadata for satisfaction data...\n');

  // Get recent logbooks with metadata
  const logbooks = await prisma.logbook.findMany({
    where: {
      status: 'PUBLISHED',
    },
    include: {
      LogPreferenceMetadata: true,
      Assignment: {
        include: {
          Crew: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
    take: 5,
  });

  console.log(`Found ${logbooks.length} published logbooks\n`);

  for (const logbook of logbooks) {
    console.log(`\n📅 Logbook: ${logbook.date.toISOString().split('T')[0]} (ID: ${logbook.id})`);
    console.log(`   Store ID: ${logbook.storeId}`);
    console.log(`   Status: ${logbook.status}`);
    console.log(`   Assignments: ${logbook.Assignment.length}`);

    const metadata = logbook.LogPreferenceMetadata;

    if (!metadata) {
      console.log('   ❌ NO LogPreferenceMetadata found');
      continue;
    }

    console.log(`   ✅ LogPreferenceMetadata found`);
    console.log(`   Eligible Preferences: ${metadata.eligiblePreferences}`);
    console.log(`   Preferences Met: ${metadata.preferencesMet}`);
    console.log(`   Percent Met: ${metadata.percentMet}%`);
    console.log(`   Avg Satisfaction: ${metadata.avgSatisfaction}%`);
    console.log(`   Eligible Crew: ${metadata.eligibleCrew}`);
    console.log(`   Avg Satisfaction Per Crew: ${metadata.avgSatisfactionPerCrew}%`);
    console.log(`   Fairness Index: ${metadata.fairnessIndex}%`);
    console.log(`   Fairness Grade: ${metadata.fairnessGrade}`);

    // Check breakdownByCrew
    const breakdownByCrew = Array.isArray(metadata.breakdownByCrew)
      ? (metadata.breakdownByCrew as any[])
      : [];

    console.log(`\n   📊 breakdownByCrew: ${breakdownByCrew.length} entries`);

    if (breakdownByCrew.length === 0) {
      console.log('   ⚠️  breakdownByCrew is EMPTY!');
    } else {
      console.log('   Sample crew entries:');
      for (const crew of breakdownByCrew.slice(0, 3)) {
        console.log(`      - ${crew.crewId}: total=${crew.total}, met=${crew.met}, avgSat=${crew.avgSatisfaction?.toFixed(1) || 0}%, satPct=${crew.satisfactionPct?.toFixed(1) || 0}%`);
      }
    }

    // Check breakdownByRoleRule
    const breakdownByRoleRule = Array.isArray(metadata.breakdownByRoleRule)
      ? (metadata.breakdownByRoleRule as any[])
      : [];

    console.log(`\n   📊 breakdownByRoleRule: ${breakdownByRoleRule.length} entries`);

    if (breakdownByRoleRule.length === 0) {
      console.log('   ⚠️  breakdownByRoleRule is EMPTY!');
    } else {
      console.log('   Sample rule entries:');
      for (const rule of breakdownByRoleRule.slice(0, 3)) {
        console.log(`      - RuleID ${rule.roleRuleId} (${rule.ruleType}): eligible=${rule.eligible}, met=${rule.met}, avgSat=${rule.avgSatisfaction?.toFixed(1) || 0}%`);
      }
    }

    // Get unique crew from assignments
    const uniqueCrew = new Set(logbook.Assignment.map(a => a.crewId));
    console.log(`\n   👥 Unique crew in assignments: ${uniqueCrew.size}`);
    if (breakdownByCrew.length > 0 && uniqueCrew.size !== breakdownByCrew.length) {
      console.log(`   ⚠️  Mismatch! Assignments have ${uniqueCrew.size} crew but breakdownByCrew has ${breakdownByCrew.length} entries`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
