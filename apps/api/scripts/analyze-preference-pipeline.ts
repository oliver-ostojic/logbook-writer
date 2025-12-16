/**
 * Preference Pipeline Analyzer
 * 
 * Analyzes preference satisfaction with proper eligibility filtering:
 * - A preference is ELIGIBLE if the crew was assigned the rule's role
 * - A crew is ELIGIBLE if they have at least 1 eligible preference
 * 
 * Outputs:
 * - Satisfaction breakdown by roleRuleId
 * - Average satisfaction per eligible crew
 * - Total satisfaction across all eligible preferences
 * - Percent of eligible preferences met
 */

import { PrismaClient, RoleRuleType } from '@prisma/client';
import {
  calculateCrewRuleSatisfaction,
  type AssignmentRecord,
  type CrewRoleRuleRecord,
  type CrewShiftWindow,
  type SatisfactionResult,
} from '../src/services/crew-rule-satisfaction';

const prisma = new PrismaClient();

interface RoleRuleStats {
  roleRuleId: number;
  ruleType: RoleRuleType;
  roleCode: string;
  targetRoleCode: string | null;
  description: string | null;
  totalPreferences: number;       // All crew with this preference
  eligiblePreferences: number;    // Only those where role was assigned
  eligibleMet: number;            // Eligible preferences that were met
  eligibleSatisfactionSum: number;
  avgSatisfaction: number;        // Only for eligible
  percentMet: number;             // Only for eligible
}

interface CrewStats {
  crewId: string;
  crewName: string;
  totalPreferences: number;
  eligiblePreferences: number;
  eligibleMet: number;
  avgSatisfaction: number;
}

interface AnalyzerOutput {
  // Summary
  totalCrewWithPreferences: number;
  eligibleCrew: number;              // Crew with at least 1 eligible preference
  totalPreferences: number;
  eligiblePreferences: number;
  eligiblePreferencesMet: number;
  
  // Satisfaction metrics (ELIGIBLE ONLY)
  avgSatisfactionPerEligibleCrew: number;
  totalEligibleSatisfaction: number;
  percentEligibleMet: number;
  
  // Breakdowns
  byRoleRule: RoleRuleStats[];
  byRuleType: Map<RoleRuleType, {
    eligible: number;
    met: number;
    satSum: number;
    avgSat: number;
    pctMet: number;
  }>;
  
  // Per-crew details (eligible only)
  crewStats: CrewStats[];
}

async function analyzePreferences(storeId: number, date: Date): Promise<AnalyzerOutput> {
  console.log(`\n🔍 Analyzing preferences for store ${storeId} on ${date.toISOString().split('T')[0]}`);
  console.log('═'.repeat(70));

  // Get logbook with assignments
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
    throw new Error(`No logbook found for store ${storeId} on ${date.toISOString().split('T')[0]}`);
  }

  console.log(`📋 Logbook: ${logbook.id} (${logbook.status})`);
  console.log(`   Assignments: ${logbook.Assignment.length}`);

  // Convert assignments
  const assignments: AssignmentRecord[] = logbook.Assignment.map(a => ({
    crewId: a.crewId,
    roleId: a.roleId,
    startMinutes: a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes(),
    endMinutes: a.endTime.getUTCHours() * 60 + a.endTime.getUTCMinutes(),
  }));

  // Build set of roles assigned to each crew
  const rolesAssignedByCrew = new Map<string, Set<number>>();
  for (const a of assignments) {
    if (!rolesAssignedByCrew.has(a.crewId)) {
      rolesAssignedByCrew.set(a.crewId, new Set());
    }
    rolesAssignedByCrew.get(a.crewId)!.add(a.roleId);
  }

  const crewIds = [...rolesAssignedByCrew.keys()];
  console.log(`   Crew in logbook: ${crewIds.length}`);

  // Get shifts
  const shifts = await prisma.shift.findMany({
    where: { storeId, date, crewId: { in: crewIds } }
  });
  const crewShifts = new Map<string, CrewShiftWindow>();
  for (const shift of shifts) {
    crewShifts.set(shift.crewId, {
      crewId: shift.crewId,
      shiftStartMin: shift.startMin,
      shiftEndMin: shift.endMin,
    });
  }

  // Get all roles for block sizes and code lookup
  const roles = await prisma.role.findMany({
    where: { storeId },
    select: { id: true, code: true, taskLength: true }
  });
  const roleBlockSizes = new Map<number, number>();
  const roleCodeById = new Map<number, string>();
  for (const role of roles) {
    roleBlockSizes.set(role.id, role.taskLength);
    roleCodeById.set(role.id, role.code);
  }

  // Get all CrewRoleRules with their RoleRule details
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

  console.log(`   CrewRoleRules: ${crewRoleRules.length}`);

  // Get all unique RoleRules for the breakdown
  const roleRuleDetails = new Map<number, {
    id: number;
    type: RoleRuleType;
    roleId: number;
    roleCode: string;
    targetRoleId: number | null;
    targetRoleCode: string | null;
    description: string | null;
  }>();
  
  for (const crr of crewRoleRules) {
    if (!roleRuleDetails.has(crr.roleRuleId)) {
      roleRuleDetails.set(crr.roleRuleId, {
        id: crr.RoleRule.id,
        type: crr.RoleRule.type,
        roleId: crr.RoleRule.roleId,
        roleCode: crr.RoleRule.Role.code,
        targetRoleId: crr.RoleRule.targetRoleId,
        targetRoleCode: crr.RoleRule.TargetRole?.code ?? null,
        description: crr.RoleRule.description,
      });
    }
  }

  // Transform to interface for calculator
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

  // Calculate satisfaction (this already filters out N/A cases)
  const satisfactionResults = calculateCrewRuleSatisfaction(
    crewRoleRuleRecords,
    assignments,
    crewShifts,
    roleBlockSizes
  );

  console.log(`   Satisfaction results: ${satisfactionResults.length} (eligible preferences)`);

  // Build eligibility info
  // A result is eligible if it was returned (the calculator already filters non-applicable)
  const eligibleByCrewRoleRule = new Set(satisfactionResults.map(r => r.crewRoleRuleId));

  // =========================================================================
  // Aggregate by RoleRule
  // =========================================================================
  const statsByRoleRule = new Map<number, {
    total: number;
    eligible: number;
    met: number;
    satSum: number;
  }>();

  // Initialize with all role rules that have crew preferences
  for (const crr of crewRoleRules) {
    if (!statsByRoleRule.has(crr.roleRuleId)) {
      statsByRoleRule.set(crr.roleRuleId, { total: 0, eligible: 0, met: 0, satSum: 0 });
    }
    statsByRoleRule.get(crr.roleRuleId)!.total++;
  }

  // Add eligible results
  for (const r of satisfactionResults) {
    const crr = crewRoleRules.find(c => c.id === r.crewRoleRuleId);
    if (!crr) continue;
    
    const stats = statsByRoleRule.get(crr.roleRuleId)!;
    stats.eligible++;
    if (r.met) stats.met++;
    stats.satSum += r.satisfaction;
  }

  // Build final roleRule stats
  const byRoleRule: RoleRuleStats[] = [];
  for (const [roleRuleId, stats] of statsByRoleRule) {
    const details = roleRuleDetails.get(roleRuleId)!;
    byRoleRule.push({
      roleRuleId,
      ruleType: details.type,
      roleCode: details.roleCode,
      targetRoleCode: details.targetRoleCode,
      description: details.description,
      totalPreferences: stats.total,
      eligiblePreferences: stats.eligible,
      eligibleMet: stats.met,
      eligibleSatisfactionSum: stats.satSum,
      avgSatisfaction: stats.eligible > 0 ? stats.satSum / stats.eligible : 0,
      percentMet: stats.eligible > 0 ? (stats.met / stats.eligible) * 100 : 0,
    });
  }

  // Sort by roleRuleId
  byRoleRule.sort((a, b) => a.roleRuleId - b.roleRuleId);

  // =========================================================================
  // Aggregate by RuleType
  // =========================================================================
  const byRuleType = new Map<RoleRuleType, {
    eligible: number;
    met: number;
    satSum: number;
    avgSat: number;
    pctMet: number;
  }>();

  for (const r of satisfactionResults) {
    if (!byRuleType.has(r.ruleType)) {
      byRuleType.set(r.ruleType, { eligible: 0, met: 0, satSum: 0, avgSat: 0, pctMet: 0 });
    }
    const stats = byRuleType.get(r.ruleType)!;
    stats.eligible++;
    if (r.met) stats.met++;
    stats.satSum += r.satisfaction;
  }

  // Calculate averages
  for (const [, stats] of byRuleType) {
    stats.avgSat = stats.eligible > 0 ? stats.satSum / stats.eligible : 0;
    stats.pctMet = stats.eligible > 0 ? (stats.met / stats.eligible) * 100 : 0;
  }

  // =========================================================================
  // Aggregate by Crew (ELIGIBLE ONLY)
  // =========================================================================
  const statsByCrew = new Map<string, {
    crewId: string;
    crewName: string;
    total: number;
    eligible: number;
    met: number;
    satSum: number;
  }>();

  // Initialize with all crew who have preferences
  for (const crr of crewRoleRules) {
    if (!statsByCrew.has(crr.crewId)) {
      statsByCrew.set(crr.crewId, {
        crewId: crr.crewId,
        crewName: crr.Crew.name,
        total: 0,
        eligible: 0,
        met: 0,
        satSum: 0,
      });
    }
    statsByCrew.get(crr.crewId)!.total++;
  }

  // Add eligible results
  for (const r of satisfactionResults) {
    const stats = statsByCrew.get(r.crewId);
    if (!stats) continue;
    
    stats.eligible++;
    if (r.met) stats.met++;
    stats.satSum += r.satisfaction;
  }

  // Filter to only eligible crew (those with at least 1 eligible preference)
  const eligibleCrewStats: CrewStats[] = [];
  for (const [, stats] of statsByCrew) {
    if (stats.eligible > 0) {
      eligibleCrewStats.push({
        crewId: stats.crewId,
        crewName: stats.crewName,
        totalPreferences: stats.total,
        eligiblePreferences: stats.eligible,
        eligibleMet: stats.met,
        avgSatisfaction: stats.satSum / stats.eligible,
      });
    }
  }

  // Sort by crew name
  eligibleCrewStats.sort((a, b) => a.crewName.localeCompare(b.crewName));

  // =========================================================================
  // Overall Stats
  // =========================================================================
  const totalCrewWithPreferences = statsByCrew.size;
  const eligibleCrew = eligibleCrewStats.length;
  const totalPreferences = crewRoleRules.length;
  const eligiblePreferences = satisfactionResults.length;
  const eligiblePreferencesMet = satisfactionResults.filter(r => r.met).length;
  
  const totalEligibleSatisfaction = satisfactionResults.reduce((sum, r) => sum + r.satisfaction, 0);
  const avgSatisfactionPerEligibleCrew = eligibleCrewStats.length > 0
    ? eligibleCrewStats.reduce((sum, c) => sum + c.avgSatisfaction, 0) / eligibleCrewStats.length
    : 0;
  const percentEligibleMet = eligiblePreferences > 0
    ? (eligiblePreferencesMet / eligiblePreferences) * 100
    : 0;

  return {
    totalCrewWithPreferences,
    eligibleCrew,
    totalPreferences,
    eligiblePreferences,
    eligiblePreferencesMet,
    avgSatisfactionPerEligibleCrew,
    totalEligibleSatisfaction,
    percentEligibleMet,
    byRoleRule,
    byRuleType,
    crewStats: eligibleCrewStats,
  };
}

function printAnalysis(output: AnalyzerOutput) {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    PREFERENCE SATISFACTION ANALYSIS                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n📊 OVERALL SUMMARY');
  console.log('─'.repeat(70));
  console.log(`   Total Crew with Preferences:    ${output.totalCrewWithPreferences}`);
  console.log(`   Eligible Crew:                  ${output.eligibleCrew} (have ≥1 eligible preference)`);
  console.log(`   Total Preferences:              ${output.totalPreferences}`);
  console.log(`   Eligible Preferences:           ${output.eligiblePreferences} (role was assigned)`);
  console.log(`   Eligible Preferences Met:       ${output.eligiblePreferencesMet}`);
  console.log('');
  console.log(`   ⭐ Avg Satisfaction (per crew):  ${(output.avgSatisfactionPerEligibleCrew * 100).toFixed(1)}%`);
  console.log(`   ⭐ Total Eligible Satisfaction:  ${(output.totalEligibleSatisfaction / output.eligiblePreferences * 100).toFixed(1)}%`);
  console.log(`   ⭐ Percent Eligible Met:         ${output.percentEligibleMet.toFixed(1)}%`);

  // =========================================================================
  // By Rule Type
  // =========================================================================
  console.log('\n📋 BY RULE TYPE');
  console.log('─'.repeat(70));
  console.log('   Rule Type'.padEnd(40) + 'Eligible'.padStart(10) + 'Met'.padStart(8) + 'Avg Sat'.padStart(10) + '% Met'.padStart(10));
  console.log('   ' + '─'.repeat(67));

  const sortedTypes = [...output.byRuleType.entries()].sort((a, b) => b[1].eligible - a[1].eligible);
  for (const [ruleType, stats] of sortedTypes) {
    const line = `   ${ruleType.padEnd(37)}${stats.eligible.toString().padStart(10)}${stats.met.toString().padStart(8)}${(stats.avgSat * 100).toFixed(1).padStart(9)}%${stats.pctMet.toFixed(1).padStart(9)}%`;
    console.log(line);
  }

  // =========================================================================
  // By RoleRule
  // =========================================================================
  console.log('\n📜 BY ROLE RULE');
  console.log('─'.repeat(90));
  console.log('   ID'.padEnd(6) + 'Type'.padEnd(35) + 'Role'.padEnd(8) + 'Target'.padEnd(8) + 'Total'.padStart(7) + 'Elig'.padStart(7) + 'Met'.padStart(6) + 'Avg%'.padStart(8) + 'Met%'.padStart(8));
  console.log('   ' + '─'.repeat(87));

  for (const rule of output.byRoleRule) {
    const line = `   ${rule.roleRuleId.toString().padEnd(5)}${rule.ruleType.substring(0, 33).padEnd(35)}${rule.roleCode.padEnd(8)}${(rule.targetRoleCode ?? '-').padEnd(8)}${rule.totalPreferences.toString().padStart(7)}${rule.eligiblePreferences.toString().padStart(7)}${rule.eligibleMet.toString().padStart(6)}${(rule.avgSatisfaction * 100).toFixed(1).padStart(7)}%${rule.percentMet.toFixed(1).padStart(7)}%`;
    console.log(line);
  }

  // =========================================================================
  // Per Crew (sample)
  // =========================================================================
  console.log('\n👥 PER CREW (ELIGIBLE ONLY) - First 20');
  console.log('─'.repeat(70));
  console.log('   Crew Name'.padEnd(25) + 'Total'.padStart(8) + 'Eligible'.padStart(10) + 'Met'.padStart(6) + 'Avg Sat'.padStart(12));
  console.log('   ' + '─'.repeat(67));

  const sampleCrew = output.crewStats.slice(0, 20);
  for (const crew of sampleCrew) {
    const line = `   ${crew.crewName.substring(0, 22).padEnd(25)}${crew.totalPreferences.toString().padStart(8)}${crew.eligiblePreferences.toString().padStart(10)}${crew.eligibleMet.toString().padStart(6)}${(crew.avgSatisfaction * 100).toFixed(1).padStart(11)}%`;
    console.log(line);
  }

  if (output.crewStats.length > 20) {
    console.log(`   ... and ${output.crewStats.length - 20} more eligible crew`);
  }

  // =========================================================================
  // LogPreferenceMetadata Proposal
  // =========================================================================
  console.log('\n📝 PROPOSED LogPreferenceMetadata VALUES');
  console.log('─'.repeat(70));
  console.log(`   totalPreferences:        ${output.eligiblePreferences}  (eligible only)`);
  console.log(`   preferencesMet:          ${output.eligiblePreferencesMet}`);
  console.log(`   averageSatisfaction:     ${(output.totalEligibleSatisfaction / output.eligiblePreferences).toFixed(4)}  (0-1 scale)`);
  console.log(`   avgSatisfactionPerCrew:  ${output.avgSatisfactionPerEligibleCrew.toFixed(4)}  (0-1 scale) [NEW]`);
  console.log(`   eligibleCrew:            ${output.eligibleCrew}  [NEW]`);
  console.log(`   fairnessIndex:           TODO`);
  console.log('');
}

async function main() {
  try {
    const output = await analyzePreferences(768, new Date('2025-11-25'));
    printAnalysis(output);
    console.log('✅ Analysis complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
