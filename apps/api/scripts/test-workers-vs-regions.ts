/**
 * Workers vs Regions A/B Test
 * 
 * Compares:
 * - Config A: 12 regions × 1 worker (current production)
 * - Config B: 6 regions × 2 workers (fewer regions, more power each)
 * 
 * Tests on the same day multiple times to measure quality and variance.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = '2025-12-16'; // Use a real date with data
const RUNS_PER_CONFIG = 5; // Run each config multiple times

interface ConfigResult {
  name: string;
  numRegions: number;
  workersPerRegion: number;
  runs: {
    satisfaction: number;
    gini: number;
    duration: number;
    objectiveValue: number;
  }[];
  avgSatisfaction: number;
  avgGini: number;
  avgDuration: number;
  avgObjective: number;
  stdSatisfaction: number;
}

const CONFIGS = [
  { name: '12 regions × 1 worker', numRegions: 12, workersPerRegion: 1 },
  { name: '6 regions × 2 workers', numRegions: 6, workersPerRegion: 2 },
  { name: '4 regions × 3 workers', numRegions: 4, workersPerRegion: 3 },
];

async function runSolverWithConfig(
  date: string,
  numRegions: number,
  workersPerRegion: number
): Promise<{ satisfaction: number; gini: number; duration: number; objectiveValue: number }> {
  const startTime = Date.now();
  
  const response = await fetch('http://localhost:4000/solver/v2/tune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date: date,
      saveLogbook: false, // Don't save, just measure
      tuningConfig: {
        numRegions,
        workersPerRegion,
        shotsPerRegion: 3,
        timeLimitPerShot: 15,
      }
    })
  });
  
  const duration = (Date.now() - startTime) / 1000;
  
  if (!response.ok) {
    throw new Error(`Solver failed: ${response.status} ${await response.text()}`);
  }
  
  const result = await response.json();
  
  return {
    satisfaction: result.preferenceMetadata?.percentMet ?? 0,
    gini: 0, // Can't measure Gini without saving (need snapshot)
    duration,
    objectiveValue: result.objectiveValue ?? 0,
  };
}

function calculateStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

async function main() {
  console.log('🔬 Workers vs Regions A/B Test');
  console.log('=' .repeat(60));
  console.log(`Store: ${STORE_ID}`);
  console.log(`Date: ${TEST_DATE}`);
  console.log(`Runs per config: ${RUNS_PER_CONFIG}`);
  console.log('');
  
  const results: ConfigResult[] = [];
  
  try {
    for (const config of CONFIGS) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🧪 Testing: ${config.name}`);
      console.log(`${'='.repeat(50)}`);
      
      const runs: ConfigResult['runs'] = [];
      
      for (let run = 1; run <= RUNS_PER_CONFIG; run++) {
        process.stdout.write(`  Run ${run}/${RUNS_PER_CONFIG}... `);
        
        const result = await runSolverWithConfig(
          TEST_DATE,
          config.numRegions,
          config.workersPerRegion
        );
        
        runs.push(result);
        console.log(`Sat=${result.satisfaction.toFixed(1)}% | Obj=${result.objectiveValue} (${result.duration.toFixed(0)}s)`);
      }
      
      const avgSatisfaction = runs.reduce((s, r) => s + r.satisfaction, 0) / runs.length;
      const avgGini = runs.reduce((s, r) => s + r.gini, 0) / runs.length;
      const avgDuration = runs.reduce((s, r) => s + r.duration, 0) / runs.length;
      const avgObjective = runs.reduce((s, r) => s + r.objectiveValue, 0) / runs.length;
      const stdSatisfaction = calculateStd(runs.map(r => r.satisfaction), avgSatisfaction);
      
      results.push({
        name: config.name,
        numRegions: config.numRegions,
        workersPerRegion: config.workersPerRegion,
        runs,
        avgSatisfaction,
        avgGini,
        avgDuration,
        avgObjective,
        stdSatisfaction,
      });
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 COMPARISON SUMMARY');
    console.log('=' .repeat(70));
    
    console.log('\n Config                  | Avg Sat | Std Dev | Avg Obj    | Avg Time');
    console.log('-'.repeat(70));
    
    for (const r of results) {
      console.log(
        ` ${r.name.padEnd(22)} | ` +
        `${r.avgSatisfaction.toFixed(1)}%`.padStart(7) + ` | ` +
        `±${r.stdSatisfaction.toFixed(1)}%`.padStart(7) + ` | ` +
        `${r.avgObjective.toFixed(0)}`.padStart(10) + ` | ` +
        `${r.avgDuration.toFixed(0)}s`
      );
    }
    
    // Winner
    const best = results.reduce((a, b) => a.avgSatisfaction > b.avgSatisfaction ? a : b);
    const mostConsistent = results.reduce((a, b) => a.stdSatisfaction < b.stdSatisfaction ? a : b);
    
    console.log('\n🏆 Results:');
    console.log(`   Best satisfaction: ${best.name} (${best.avgSatisfaction.toFixed(1)}%)`);
    console.log(`   Most consistent: ${mostConsistent.name} (±${mostConsistent.stdSatisfaction.toFixed(1)}%)`);
    
    // Variance analysis
    console.log('\n📈 Individual Runs (Satisfaction %):');
    for (const r of results) {
      const sats = r.runs.map(run => run.satisfaction.toFixed(1)).join(', ');
      console.log(`   ${r.name}: [${sats}]`);
    }
    
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
