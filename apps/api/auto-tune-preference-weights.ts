/**
 * Auto-Tune RolePreference baseWeights with Test-Driven Optimization
 * 
 * This script:
 * 1. Tests different baseWeight configurations for RolePreferences
 * 2. Runs solver and measures satisfaction outcomes
 * 3. Stores results in tuning history
 * 4. Identifies optimal weights through iterative testing
 * 
 * Methods:
 * - minority: Higher weights for rare preference types (protect minorities)
 * - majority: Higher weights for common preference types (maximize total satisfaction)
 * - balanced: All weights equal (baseline)
 * - gradient: Uses historical test results to gradient-descent toward optimal weights
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

type TuningMethod = 'minority' | 'majority' | 'balanced' | 'gradient' | 'hybrid';

interface WeightConfiguration {
  FIRST_HOUR: number;
  FAVORITE: number;
  TIMING: number;
  CONSECUTIVE: number;
}

interface TestResult {
  timestamp: string;
  method: TuningMethod;
  weights: WeightConfiguration;
  satisfaction: {
    total: number;
    met: number;
    metRate: number;
    avgSatisfaction: number;
    byType: {
      FIRST_HOUR: { total: number; met: number; avgSat: number };
      FAVORITE: { total: number; met: number; avgSat: number };
      TIMING: { total: number; met: number; avgSat: number };
      CONSECUTIVE: { total: number; met: number; avgSat: number };
    };
  };
  score: number; // Composite score for ranking
}

const HISTORY_FILE = path.join(process.cwd(), 'tuning-history.json');

/**
 * Load tuning history from file
 */
function loadHistory(): TestResult[] {
  if (fs.existsSync(HISTORY_FILE)) {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  }
  return [];
}

/**
 * Save tuning result to history
 */
function saveToHistory(result: TestResult): void {
  const history = loadHistory();
  history.push(result);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`📝 Saved result to ${HISTORY_FILE}`);
}

/**
 * Calculate composite score for ranking weight configurations
 * Higher score = better configuration
 */
function calculateScore(result: TestResult): number {
  // Weighted average of:
  // - Met rate (40%): How many preferences were satisfied
  // - Average satisfaction (30%): Quality of satisfaction
  // - Type coverage (30%): Ensure all types are reasonably satisfied
  
  const metRateScore = result.satisfaction.metRate * 40;
  const avgSatScore = result.satisfaction.avgSatisfaction * 30;
  
  // Type coverage: average of all type met rates
  const typeCoverage = [
    result.satisfaction.byType.FIRST_HOUR.met / Math.max(1, result.satisfaction.byType.FIRST_HOUR.total),
    result.satisfaction.byType.FAVORITE.met / Math.max(1, result.satisfaction.byType.FAVORITE.total),
    result.satisfaction.byType.TIMING.met / Math.max(1, result.satisfaction.byType.TIMING.total),
    result.satisfaction.byType.CONSECUTIVE.met / Math.max(1, result.satisfaction.byType.CONSECUTIVE.total),
  ].reduce((a, b) => a + b, 0) / 4;
  
  const typeCoverageScore = typeCoverage * 30;
  
  return metRateScore + avgSatScore + typeCoverageScore;
}

/**
 * Get preference distribution across all crew
 */
async function getPreferenceDistribution(): Promise<{
  FIRST_HOUR: number;
  FAVORITE: number;
  TIMING: number;
  CONSECUTIVE: number;
  total: number;
}> {
  const counts = await prisma.crewPreference.groupBy({
    by: ['rolePreferenceId'],
    _count: true,
  });

  const rolePrefs = await prisma.rolePreference.findMany({
    select: { id: true, preferenceType: true },
  });

  const typeCounts = {
    FIRST_HOUR: 0,
    FAVORITE: 0,
    TIMING: 0,
    CONSECUTIVE: 0,
  };

  for (const count of counts) {
    const rolePref = rolePrefs.find(rp => rp.id === count.rolePreferenceId);
    if (rolePref && rolePref.preferenceType in typeCounts) {
      typeCounts[rolePref.preferenceType as keyof typeof typeCounts] += count._count;
    }
  }

  const total = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  return { ...typeCounts, total };
}

/**
 * Calculate weights using minority method (rare preferences get higher weights)
 */
function calculateMinorityWeights(distribution: ReturnType<typeof getPreferenceDistribution> extends Promise<infer T> ? T : never): WeightConfiguration {
  const { FIRST_HOUR, FAVORITE, TIMING, CONSECUTIVE, total } = distribution;
  
  // Inverse proportion: rarer preferences get higher weights
  const scale = (count: number) => {
    if (count === 0) return 3; // Default if no preferences of this type
    const proportion = count / total;
    // Map 0.0-1.0 proportion to 5-1 weight (inverted)
    return Math.max(1, Math.min(5, Math.round(5 - proportion * 4)));
  };

  return {
    FIRST_HOUR: scale(FIRST_HOUR),
    FAVORITE: scale(FAVORITE),
    TIMING: scale(TIMING),
    CONSECUTIVE: scale(CONSECUTIVE),
  };
}

/**
 * Calculate weights using majority method (common preferences get higher weights)
 */
function calculateMajorityWeights(distribution: ReturnType<typeof getPreferenceDistribution> extends Promise<infer T> ? T : never): WeightConfiguration {
  const { FIRST_HOUR, FAVORITE, TIMING, CONSECUTIVE, total } = distribution;
  
  // Direct proportion: more common preferences get higher weights
  const scale = (count: number) => {
    if (count === 0) return 3;
    const proportion = count / total;
    // Map 0.0-1.0 proportion to 1-5 weight
    return Math.max(1, Math.min(5, Math.round(1 + proportion * 4)));
  };

  return {
    FIRST_HOUR: scale(FIRST_HOUR),
    FAVORITE: scale(FAVORITE),
    TIMING: scale(TIMING),
    CONSECUTIVE: scale(CONSECUTIVE),
  };
}

/**
 * Calculate balanced weights (all equal)
 */
function calculateBalancedWeights(): WeightConfiguration {
  return {
    FIRST_HOUR: 3,
    FAVORITE: 3,
    TIMING: 3,
    CONSECUTIVE: 3,
  };
}

/**
 * Calculate HYBRID weights:
 * - Uses distribution to set a baseline per type
 * - Then adjusts per type using best historical outcomes for that type (if any)
 * This allows e.g. CONSECUTIVE to use one approach while TIMING uses another.
 */
function calculateHybridWeights(
  distribution: ReturnType<typeof getPreferenceDistribution> extends Promise<infer T> ? T : never,
  history: TestResult[]
): WeightConfiguration {
  // Baseline from distribution: rarer => higher (minority), common => lower (majority)
  const total = Math.max(1, distribution.total);
  const prop = {
    FIRST_HOUR: distribution.FIRST_HOUR / total,
    FAVORITE: distribution.FAVORITE / total,
    TIMING: distribution.TIMING / total,
    CONSECUTIVE: distribution.CONSECUTIVE / total,
  };

  // Map proportion in [0,1] to weight in [1,5] with center at 0.5.
  // Rarer (<0.5) -> >3, Common (>0.5) -> <3
  const baseFromProp = (p: number) => {
    const w = 3 + (0.5 - p) * 4; // p=0 -> 5, p=0.5 -> 3, p=1 -> 1
    return Math.max(1, Math.min(5, Math.round(w)));
  };

  const baseline: WeightConfiguration = {
    FIRST_HOUR: baseFromProp(prop.FIRST_HOUR),
    FAVORITE: baseFromProp(prop.FAVORITE),
    TIMING: baseFromProp(prop.TIMING),
    CONSECUTIVE: baseFromProp(prop.CONSECUTIVE),
  };

  if (history.length === 0) {
    return baseline;
  }

  // For each type, find historical result that maximized that type's met rate
  type TypeKey = keyof WeightConfiguration;
  const types: TypeKey[] = ['FIRST_HOUR', 'FAVORITE', 'TIMING', 'CONSECUTIVE'];
  const adjusted = { ...baseline } as WeightConfiguration;

  for (const t of types) {
    let best: { weight: number; score: number } | null = null;
    for (const r of history) {
      const stats = r.satisfaction.byType[t];
      const metRate = stats.total > 0 ? stats.met / stats.total : 0;
      const candidateWeight = r.weights[t];
      if (best === null || metRate > best.score) {
        best = { weight: candidateWeight, score: metRate };
      }
    }

    // Blend baseline with best historical for that type to avoid drastic jumps
    if (best) {
      const blended = Math.round((baseline[t] + best.weight) / 2);
      adjusted[t] = Math.max(1, Math.min(5, blended));
    }
  }

  return adjusted;
}

/**
 * Calculate gradient-based weights using historical test results
 */
function calculateGradientWeights(history: TestResult[]): WeightConfiguration {
  if (history.length < 2) {
    console.log('⚠️  Not enough history for gradient method, using balanced');
    return calculateBalancedWeights();
  }

  // Find best performing configuration
  const best = history.reduce((prev, curr) => 
    curr.score > prev.score ? curr : prev
  );

  console.log(`📊 Best historical result: ${best.method} with score ${best.score.toFixed(2)}`);
  console.log(`   Weights: ${JSON.stringify(best.weights)}`);
  console.log(`   Met rate: ${(best.satisfaction.metRate * 100).toFixed(1)}%`);

  // Nudge weights slightly in direction that improves underperforming types
  const nudged = { ...best.weights };
  
  // Identify worst performing type
  const byType = best.satisfaction.byType;
  const typeScores = {
    FIRST_HOUR: byType.FIRST_HOUR.met / Math.max(1, byType.FIRST_HOUR.total),
    FAVORITE: byType.FAVORITE.met / Math.max(1, byType.FAVORITE.total),
    TIMING: byType.TIMING.met / Math.max(1, byType.TIMING.total),
    CONSECUTIVE: byType.CONSECUTIVE.met / Math.max(1, byType.CONSECUTIVE.total),
  };

  const worstType = Object.entries(typeScores).reduce((prev, curr) => 
     curr[1] < prev.score ? { type: curr[0], score: curr[1] } : prev
  , { type: 'FIRST_HOUR', score: typeScores.FIRST_HOUR });

  console.log(`   Worst type: ${worstType.type} at ${(worstType.score * 100).toFixed(1)}%`);
  console.log(`   Boosting ${worstType.type} weight by 1`);

  // Boost worst performing type
  nudged[worstType.type as keyof WeightConfiguration] = Math.min(5, 
    nudged[worstType.type as keyof WeightConfiguration] + 1
  );

  return nudged;
}

/**
 * Apply weights to database
 */
async function applyWeights(weights: WeightConfiguration): Promise<void> {
  console.log('\n🔄 Applying weights to RolePreferences...');
  
  for (const [type, weight] of Object.entries(weights)) {
    await prisma.rolePreference.updateMany({
      where: { preferenceType: type as any },
      data: { baseWeight: weight },
    });
  }
  
  console.log('✅ Weights applied!');
}

/**
 * Run solver test and collect satisfaction metrics
 */
async function runSolverTest(): Promise<TestResult['satisfaction']> {
  console.log('\n🧪 Running solver test...');
  
  // Load test data
  const inputPath = path.join(process.cwd(), 'solver_input_11_22.json');
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Solver input file not found: ${inputPath}`);
  }

  const solverInput = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const shifts = solverInput.crew.map((c: any) => ({
    crewId: c.id,
    start: `${Math.floor(c.shiftStartMin / 60)}:${String(c.shiftStartMin % 60).padStart(2, '0')}`,
    end: `${Math.floor(c.shiftEndMin / 60)}:${String(c.shiftEndMin % 60).padStart(2, '0')}`,
  }));

  // Call solver API
  const response = await fetch('http://localhost:4000/solve-logbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '2025-11-22',
      store_id: 768,
      shifts,
      time_limit_seconds: 30, // Shorter time limit for faster iteration
    }),
  });

  if (!response.ok) {
    throw new Error(`Solver API failed: ${await response.text()}`);
  }

  const result = await response.json();
  console.log(`   Status: ${result.solver?.metadata?.status}`);
  console.log(`   Runtime: ${result.solver?.metadata?.runtimeMs}ms`);

  // Query satisfaction results from database
  const logbook = await prisma.logbook.findFirst({
    where: {
      storeId: 768,
      date: new Date('2025-11-22'),
      status: 'DRAFT',
    },
    include: {
      preferenceMetadata: true,
      preferenceSatisfactions: {
        include: {
          rolePreference: { select: { preferenceType: true } },
        },
      },
    },
    orderBy: { generatedAt: 'desc' },
  });

  if (!logbook || !logbook.preferenceMetadata) {
    throw new Error('Logbook or preference metadata not found');
  }

  // Calculate by-type stats
  const byType = {
    FIRST_HOUR: { total: 0, met: 0, sumSat: 0, avgSat: 0 },
    FAVORITE: { total: 0, met: 0, sumSat: 0, avgSat: 0 },
    TIMING: { total: 0, met: 0, sumSat: 0, avgSat: 0 },
    CONSECUTIVE: { total: 0, met: 0, sumSat: 0, avgSat: 0 },
  };

  for (const ps of logbook.preferenceSatisfactions) {
    const type = ps.rolePreference.preferenceType as keyof typeof byType;
    byType[type].total++;
    if (ps.met) byType[type].met++;
    byType[type].sumSat += ps.satisfaction;
  }

  // Calculate averages
  for (const type of Object.keys(byType) as Array<keyof typeof byType>) {
    byType[type].avgSat = byType[type].total > 0 
      ? byType[type].sumSat / byType[type].total 
      : 0;
  }

  return {
    total: logbook.preferenceMetadata.totalPreferences,
    met: logbook.preferenceMetadata.preferencesMet,
    metRate: logbook.preferenceMetadata.totalPreferences > 0
      ? logbook.preferenceMetadata.preferencesMet / logbook.preferenceMetadata.totalPreferences
      : 0,
    avgSatisfaction: logbook.preferenceMetadata.averageSatisfaction,
    byType,
  };
}

/**
 * Main tuning function
 */
async function autoTunePreferenceWeights(method: TuningMethod, dryRun: boolean = true) {
  console.log('\n' + '='.repeat(80));
  console.log(`AUTO-TUNING ROLEPREFERENCE BASEWEIGHTS - METHOD: ${method.toUpperCase()}`);
  console.log('='.repeat(80));

  // Get preference distribution
  const distribution = await getPreferenceDistribution();
  console.log('\n📊 Preference Distribution:');
  console.log(`   FIRST_HOUR: ${distribution.FIRST_HOUR}`);
  console.log(`   FAVORITE: ${distribution.FAVORITE}`);
  console.log(`   TIMING: ${distribution.TIMING}`);
  console.log(`   CONSECUTIVE: ${distribution.CONSECUTIVE}`);
  console.log(`   Total: ${distribution.total}`);

  // Calculate weights based on method
  let weights: WeightConfiguration;
  const history = loadHistory();

  switch (method) {
    case 'minority':
      weights = calculateMinorityWeights(distribution);
      break;
    case 'majority':
      weights = calculateMajorityWeights(distribution);
      break;
    case 'gradient':
      weights = calculateGradientWeights(history);
      break;
    case 'hybrid':
      weights = calculateHybridWeights(distribution, history);
      break;
    default:
      weights = calculateBalancedWeights();
  }

  console.log(`\n⚖️  ${method.toUpperCase()} Weights:`);
  console.log(`   FIRST_HOUR: ${weights.FIRST_HOUR}`);
  console.log(`   FAVORITE: ${weights.FAVORITE}`);
  console.log(`   TIMING: ${weights.TIMING}`);
  console.log(`   CONSECUTIVE: ${weights.CONSECUTIVE}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes made');
    console.log('   Run with --apply to test these weights');
    console.log('\n' + '='.repeat(80));
    return;
  }

  // Apply weights and run test
  await applyWeights(weights);
  const satisfaction = await runSolverTest();

  // Build result
  const result: TestResult = {
    timestamp: new Date().toISOString(),
    method,
    weights,
    satisfaction,
    score: 0, // Will be calculated
  };
  result.score = calculateScore(result);

  // Display results
  console.log('\n📈 Results:');
  console.log(`   Total Preferences: ${satisfaction.total}`);
  console.log(`   Preferences Met: ${satisfaction.met} (${(satisfaction.metRate * 100).toFixed(1)}%)`);
  console.log(`   Avg Satisfaction: ${(satisfaction.avgSatisfaction * 100).toFixed(1)}%`);
  console.log(`   Composite Score: ${result.score.toFixed(2)}/100`);
  
  console.log('\n   By Type:');
  for (const [type, stats] of Object.entries(satisfaction.byType)) {
    const metRate = stats.total > 0 ? (stats.met / stats.total * 100).toFixed(1) : '0.0';
    const avgSat = (stats.avgSat * 100).toFixed(1);
    console.log(`     ${type}: ${stats.met}/${stats.total} met (${metRate}%), avg ${avgSat}%`);
  }

  // Save to history
  saveToHistory(result);

  // Compare to best historical result
  if (history.length > 0) {
    const bestHistorical = history.reduce((prev, curr) => 
      curr.score > prev.score ? curr : prev
    );
    
    console.log(`\n🏆 Comparison to Best Historical Result:`);
    console.log(`   Previous Best: ${bestHistorical.method} (${bestHistorical.timestamp.slice(0, 10)})`);
    console.log(`   Previous Score: ${bestHistorical.score.toFixed(2)}`);
    console.log(`   Current Score: ${result.score.toFixed(2)}`);
    
    if (result.score > bestHistorical.score) {
      console.log(`   ✅ NEW BEST! Improvement: +${(result.score - bestHistorical.score).toFixed(2)}`);
    } else {
      console.log(`   ⚠️  Below best by ${(bestHistorical.score - result.score).toFixed(2)}`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

// Parse command line args
const args = process.argv.slice(2);
const method = (args.find(a => ['minority', 'majority', 'balanced', 'gradient', 'hybrid'].includes(a)) || 'balanced') as TuningMethod;
const apply = args.includes('--apply');

autoTunePreferenceWeights(method, !apply)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
