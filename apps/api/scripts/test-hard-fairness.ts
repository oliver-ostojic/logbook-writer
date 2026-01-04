/**
 * Test Hard Fairness Constraint
 * 
 * Compares:
 * 1. Soft only (300/300 weights, no hard constraint)
 * 2. Hard + Soft (300/300 weights + z-score blocking)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const API_URL = 'http://localhost:4000';

interface TestConfig {
  name: string;
  enableHardFairness: boolean;
}

const TEST_CONFIGS: TestConfig[] = [
  { name: 'Soft Only (300/300)', enableHardFairness: false },
  { name: 'Hard (tiered round-robin)', enableHardFairness: true },
];

interface FairnessMetrics {
  roleId: number;
  giniCoefficient: number;
}

async function runSolver(
  date: string,
  config: TestConfig
): Promise<{ success: boolean; objectiveValue?: number; solveTimeMs: number }> {
  const startTime = Date.now();
  
  const response = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      timeLimitSeconds: 60,
      settings: {
        enableHardFairness: config.enableHardFairness,
        // Use 300/300 soft weights for all
        fairnessBoost: 300,
        fairnessPenalty: 300,
      },
    }),
  });
  
  const solveTimeMs = Date.now() - startTime;
  const data = await response.json();
  
  const objectiveValue = data.objectiveValue ?? data.metadata?.objectiveScore;
  
  return {
    success: data.success,
    objectiveValue,
    solveTimeMs,
  };
}

async function getFairnessSnapshots(date: string): Promise<FairnessMetrics[]> {
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
      roleId: { in: TRACKED_ROLE_IDS },
    },
  });
  
  return snapshots.map(s => ({
    roleId: s.roleId,
    giniCoefficient: s.giniCoefficient,
  }));
}

async function getSatisfactionMetrics(date: string): Promise<{ satisfactionRate: number } | null> {
  const logbook = await prisma.logbook.findFirst({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
    },
    select: { id: true },
  });
  
  if (!logbook) return null;
  
  const metadata = await prisma.logPreferenceMetadata.findUnique({
    where: { logbookId: logbook.id },
    select: { percentMet: true },
  });
  
  if (!metadata) return null;
  
  return { satisfactionRate: metadata.percentMet };
}

async function testConfig(config: TestConfig): Promise<{
  name: string;
  avgGini: number;
  avgSatisfaction: number;
  avgObjective: number;
  successRate: number;
  roleGinis: Map<number, number>;
}> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing: ${config.name}`);
  console.log(`${'─'.repeat(60)}`);
  
  let totalGini = 0;
  let totalSatisfaction = 0;
  let totalObjective = 0;
  let successCount = 0;
  const roleGiniSums = new Map<number, number>();
  const roleGiniCounts = new Map<number, number>();
  
  for (const date of TEST_DATES) {
    console.log(`  ${date}: `);
    const result = await runSolver(date, config);
    
    if (result.success) {
      const satisfaction = await getSatisfactionMetrics(date);
      const satRate = satisfaction?.satisfactionRate ?? 0;
      const fairness = await getFairnessSnapshots(date);
      
      const avgGini = fairness.length > 0
        ? fairness.reduce((sum, f) => sum + f.giniCoefficient, 0) / fairness.length
        : 0;
      
      console.log(`    ✓ ${(result.solveTimeMs / 1000).toFixed(1)}s, obj=${result.objectiveValue}, sat=${satRate.toFixed(1)}%, gini=${avgGini.toFixed(4)}`);
      
      totalGini += avgGini;
      totalSatisfaction += satRate;
      totalObjective += result.objectiveValue || 0;
      successCount++;
      
      for (const f of fairness) {
        roleGiniSums.set(f.roleId, (roleGiniSums.get(f.roleId) ?? 0) + f.giniCoefficient);
        roleGiniCounts.set(f.roleId, (roleGiniCounts.get(f.roleId) ?? 0) + 1);
      }
    } else {
      console.log(`    ✗ FAILED (may be infeasible with hard constraint)`);
    }
  }
  
  const avgGini = successCount > 0 ? totalGini / successCount : 0;
  const avgSatisfaction = successCount > 0 ? totalSatisfaction / successCount : 0;
  const avgObjective = successCount > 0 ? totalObjective / successCount : 0;
  
  const roleGinis = new Map<number, number>();
  for (const [roleId, sum] of roleGiniSums) {
    const count = roleGiniCounts.get(roleId) ?? 1;
    roleGinis.set(roleId, sum / count);
  }
  
  console.log(`  → Success: ${successCount}/${TEST_DATES.length}, Avg Gini: ${avgGini.toFixed(4)}, Avg Sat: ${avgSatisfaction.toFixed(1)}%`);
  
  return {
    name: config.name,
    avgGini,
    avgSatisfaction,
    avgObjective,
    successRate: successCount / TEST_DATES.length,
    roleGinis,
  };
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    HARD FAIRNESS CONSTRAINT TEST                           ║
║                                                                            ║
║  Comparing soft-only vs hard+soft fairness constraints                     ║
║  Dates: ${TEST_DATES.join(', ')}                                         
║  Tracked Roles: Parking Helms, Wine Demo, Food Demo                        ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

  const results = [];
  
  for (const config of TEST_CONFIGS) {
    const result = await testConfig(config);
    results.push(result);
  }
  
  // Summary
  console.log('\n\n' + '═'.repeat(100));
  console.log('RESULTS SUMMARY');
  console.log('═'.repeat(100));
  
  const baseline = results[0];
  
  console.log('\n  Config                    | Success | Avg Gini | Δ Gini    | Satisfy% | Δ Sat%   | PH     | Wine   | Food');
  console.log('  ' + '─'.repeat(95));
  
  for (const r of results) {
    const name = r.name.padEnd(27);
    const success = `${(r.successRate * 100).toFixed(0)}%`.padStart(7);
    const gini = r.avgGini.toFixed(4).padStart(8);
    
    const giniDiff = r.avgGini - baseline.avgGini;
    const giniDiffStr = (giniDiff >= 0 ? '+' : '') + giniDiff.toFixed(4);
    
    const sat = r.avgSatisfaction.toFixed(1).padStart(8);
    const satDiff = r.avgSatisfaction - baseline.avgSatisfaction;
    const satDiffStr = (satDiff >= 0 ? '+' : '') + satDiff.toFixed(1);
    
    const ph = (r.roleGinis.get(29) ?? 0).toFixed(3).padStart(6);
    const wine = (r.roleGinis.get(37) ?? 0).toFixed(3).padStart(6);
    const food = (r.roleGinis.get(38) ?? 0).toFixed(3).padStart(6);
    
    let marker = '';
    if (giniDiff < -0.02 && satDiff >= -1) marker = ' ✅';
    else if (r.successRate < 1) marker = ' ⚠️';
    
    console.log(`  ${name} | ${success} | ${gini} | ${giniDiffStr.padStart(9)} | ${sat} | ${satDiffStr.padStart(8)} | ${ph} | ${wine} | ${food}${marker}`);
  }
  
  console.log('\n');
  
  // Find best
  const feasibleResults = results.filter(r => r.successRate === 1);
  if (feasibleResults.length > 0) {
    const bestFairness = [...feasibleResults].sort((a, b) => a.avgGini - b.avgGini)[0];
    const bestSatisfaction = [...feasibleResults].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction)[0];
    
    console.log(`  Best Fairness:     ${bestFairness.name} (Gini: ${bestFairness.avgGini.toFixed(4)})`);
    console.log(`  Best Satisfaction: ${bestSatisfaction.name} (Sat: ${bestSatisfaction.avgSatisfaction.toFixed(1)}%)`);
    
    if (bestFairness.avgGini < baseline.avgGini - 0.01) {
      console.log(`\n  ✅ Hard constraint improves fairness!`);
    } else {
      console.log(`\n  ℹ️  Hard constraint has minimal impact on fairness.`);
    }
  } else {
    console.log(`  ⚠️  All hard constraint configs caused infeasibility!`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
