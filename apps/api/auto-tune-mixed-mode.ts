import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TuningResponse {
  totalCrew: number;
  dimensions: {
    prefFirstHour: {
      counts: { PRODUCT: number; REGISTER: number };
      recommendations: { PRODUCT: number; REGISTER: number };
    };
    prefTask: {
      counts: { PRODUCT: number; REGISTER: number };
      recommendations: { PRODUCT: number; REGISTER: number };
    };
    prefBreakTiming: {
      counts: { early: number; late: number; none: number };
      recommendations: { early: number; late: number };
    };
  };
}

/**
 * Calculate distribution skew for a preference dimension
 * Returns the absolute difference from 50/50 split
 * 
 * Examples:
 * - 50/50 split → 0% skew (perfectly balanced)
 * - 65/35 split → 15% skew (slightly imbalanced)
 * - 80/20 split → 30% skew (moderately skewed)
 * - 95/5 split → 45% skew (heavily skewed)
 */
function calculateSkew(majorityProportion: number): number {
  return Math.abs(majorityProportion - 0.5);
}

/**
 * Determine optimal mode based on distribution skew
 * 
 * Strategy:
 * - < 20% skew (balanced): Use POPULARITY mode
 *   Example: 65/35 split → reward majority preference
 * 
 * - ≥ 20% skew (imbalanced): Use RARITY mode
 *   Example: 80/20 split → protect minority preference
 */
function selectMode(skew: number): 'popularity' | 'rarity' {
  const threshold = 0.20; // 20% skew threshold
  return skew < threshold ? 'popularity' : 'rarity';
}

async function fetchTuningData(mode: 'popularity' | 'rarity', storeId?: string): Promise<TuningResponse> {
  const baseUrl = 'http://localhost:4000/tuning/preferences';
  const params = new URLSearchParams({
    mode,
    min: '1',
    max: '5',
    ...(storeId && { storeId }),
  });

  const response = await fetch(`${baseUrl}?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tuning data: ${response.statusText}`);
  }

  return response.json();
}

async function applyMixedModeTuning(storeId?: string, dryRun: boolean = true) {
  console.log('🔍 Analyzing preference distributions...\n');

  // Fetch initial data in popularity mode to analyze distributions
  const analysisData = await fetchTuningData('popularity', storeId);
  const { totalCrew, dimensions } = analysisData;

  console.log(`📊 Total Crew: ${totalCrew}\n`);

  // Analyze each dimension and determine optimal mode
  const decisions: Record<string, { skew: number; mode: 'popularity' | 'rarity'; reason: string }> = {};

  // First Hour dimension
  const firstHourTotal = dimensions.prefFirstHour.counts.PRODUCT + dimensions.prefFirstHour.counts.REGISTER;
  const firstHourMajorityProp = Math.max(
    dimensions.prefFirstHour.counts.PRODUCT,
    dimensions.prefFirstHour.counts.REGISTER
  ) / firstHourTotal;
  const firstHourSkew = calculateSkew(firstHourMajorityProp);
  decisions.firstHour = {
    skew: firstHourSkew,
    mode: selectMode(firstHourSkew),
    reason: firstHourSkew < 0.20 ? 'Balanced distribution' : 'Imbalanced - protect minority',
  };

  // Task dimension
  const taskTotal = dimensions.prefTask.counts.PRODUCT + dimensions.prefTask.counts.REGISTER;
  const taskMajorityProp = Math.max(
    dimensions.prefTask.counts.PRODUCT,
    dimensions.prefTask.counts.REGISTER
  ) / taskTotal;
  const taskSkew = calculateSkew(taskMajorityProp);
  decisions.task = {
    skew: taskSkew,
    mode: selectMode(taskSkew),
    reason: taskSkew < 0.20 ? 'Balanced distribution' : 'Imbalanced - protect minority',
  };

  // Break Timing dimension
  const breakTotal = dimensions.prefBreakTiming.counts.early + dimensions.prefBreakTiming.counts.late;
  const breakMajorityProp = Math.max(
    dimensions.prefBreakTiming.counts.early,
    dimensions.prefBreakTiming.counts.late
  ) / breakTotal;
  const breakSkew = calculateSkew(breakMajorityProp);
  decisions.breakTiming = {
    skew: breakSkew,
    mode: selectMode(breakSkew),
    reason: breakSkew < 0.20 ? 'Balanced distribution' : 'Imbalanced - protect minority',
  };

  // Display analysis
  console.log('📈 Distribution Analysis:\n');
  console.log(`First Hour Preference:`);
  console.log(`  PRODUCT: ${dimensions.prefFirstHour.counts.PRODUCT} (${(dimensions.prefFirstHour.counts.PRODUCT / firstHourTotal * 100).toFixed(1)}%)`);
  console.log(`  REGISTER: ${dimensions.prefFirstHour.counts.REGISTER} (${(dimensions.prefFirstHour.counts.REGISTER / firstHourTotal * 100).toFixed(1)}%)`);
  console.log(`  Skew: ${(firstHourSkew * 100).toFixed(1)}%`);
  console.log(`  Mode: ${decisions.firstHour.mode.toUpperCase()} (${decisions.firstHour.reason})\n`);

  console.log(`Task Preference:`);
  console.log(`  PRODUCT: ${dimensions.prefTask.counts.PRODUCT} (${(dimensions.prefTask.counts.PRODUCT / taskTotal * 100).toFixed(1)}%)`);
  console.log(`  REGISTER: ${dimensions.prefTask.counts.REGISTER} (${(dimensions.prefTask.counts.REGISTER / taskTotal * 100).toFixed(1)}%)`);
  console.log(`  Skew: ${(taskSkew * 100).toFixed(1)}%`);
  console.log(`  Mode: ${decisions.task.mode.toUpperCase()} (${decisions.task.reason})\n`);

  console.log(`Break Timing Preference:`);
  console.log(`  Early: ${dimensions.prefBreakTiming.counts.early} (${(dimensions.prefBreakTiming.counts.early / breakTotal * 100).toFixed(1)}%)`);
  console.log(`  Late: ${dimensions.prefBreakTiming.counts.late} (${(dimensions.prefBreakTiming.counts.late / breakTotal * 100).toFixed(1)}%)`);
  console.log(`  Skew: ${(breakSkew * 100).toFixed(1)}%`);
  console.log(`  Mode: ${decisions.breakTiming.mode.toUpperCase()} (${decisions.breakTiming.reason})\n`);

  // Fetch recommendations for each mode needed
  const modesNeeded = new Set(Object.values(decisions).map(d => d.mode));
  const tuningData: Record<string, TuningResponse> = {};

  for (const mode of modesNeeded) {
    tuningData[mode] = await fetchTuningData(mode, storeId);
  }

  // Build final weight recommendations using the optimal mode for each dimension
  const finalWeights = {
    prefFirstHourWeight: {
      PRODUCT: tuningData[decisions.firstHour.mode].dimensions.prefFirstHour.recommendations.PRODUCT,
      REGISTER: tuningData[decisions.firstHour.mode].dimensions.prefFirstHour.recommendations.REGISTER,
    },
    prefTaskWeight: {
      PRODUCT: tuningData[decisions.task.mode].dimensions.prefTask.recommendations.PRODUCT,
      REGISTER: tuningData[decisions.task.mode].dimensions.prefTask.recommendations.REGISTER,
    },
    prefBreakTimingWeight: {
      early: tuningData[decisions.breakTiming.mode].dimensions.prefBreakTiming.recommendations.early,
      late: tuningData[decisions.breakTiming.mode].dimensions.prefBreakTiming.recommendations.late,
    },
  };

  console.log('⚖️  Final Mixed-Mode Recommendations:\n');
  console.log(`First Hour (${decisions.firstHour.mode}):`);
  console.log(`  PRODUCT: ${finalWeights.prefFirstHourWeight.PRODUCT}`);
  console.log(`  REGISTER: ${finalWeights.prefFirstHourWeight.REGISTER}\n`);

  console.log(`Task (${decisions.task.mode}):`);
  console.log(`  PRODUCT: ${finalWeights.prefTaskWeight.PRODUCT}`);
  console.log(`  REGISTER: ${finalWeights.prefTaskWeight.REGISTER}\n`);

  console.log(`Break Timing (${decisions.breakTiming.mode}):`);
  console.log(`  Early: ${finalWeights.prefBreakTimingWeight.early}`);
  console.log(`  Late: ${finalWeights.prefBreakTimingWeight.late}\n`);

  if (dryRun) {
    console.log('🔒 Dry run mode - no changes made to database');
    console.log('💡 Run with --apply flag to apply these weights to store(s)\n');
    return;
  }

  // Apply weights to Store(s)
  console.log('💾 Applying weights to store(s)...\n');

  const stores = await prisma.store.findMany({
    where: storeId ? { id: parseInt(storeId) } : undefined,
  });

  let updateCount = 0;
  for (const store of stores) {
    await prisma.store.update({
      where: { id: store.id },
      data: {
        productFirstHourWeight: finalWeights.prefFirstHourWeight.PRODUCT,
        registerFirstHourWeight: finalWeights.prefFirstHourWeight.REGISTER,
        productTaskWeight: finalWeights.prefTaskWeight.PRODUCT,
        registerTaskWeight: finalWeights.prefTaskWeight.REGISTER,
        earlyBreakWeight: finalWeights.prefBreakTimingWeight.early,
        lateBreakWeight: finalWeights.prefBreakTimingWeight.late,
      },
    });
    updateCount++;
  }

  console.log(`✅ Updated ${updateCount} store(s) with mixed-mode weights\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const applyFlag = args.includes('--apply');
const storeId = args.find(arg => arg.startsWith('--store='))?.split('=')[1];

applyMixedModeTuning(storeId, !applyFlag)
  .then(() => {
    console.log('✨ Mixed-mode tuning complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
