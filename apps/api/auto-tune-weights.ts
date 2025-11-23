/**
 * Auto-Tune Store Weights Based on Preference Distribution
 * 
 * This script:
 * 1. Analyzes which preferences are common vs rare across crew
 * 2. Automatically assigns optimal weights to the store
 * 3. Updates the database with calculated weights
 * 
 * Modes:
 * - popularity: Higher weights for common preferences (maximize total satisfaction)
 * - rarity: Higher weights for rare preferences (protect minorities)
 * - balanced: All weights set to 3 (neutral)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Mode = 'popularity' | 'rarity' | 'balanced';

interface WeightConfig {
  min: number;
  max: number;
}

function calculateWeight(
  proportion: number, 
  config: WeightConfig, 
  mode: Mode
): number {
  const span = config.max - config.min;
  
  if (mode === 'rarity') {
    // Rare preferences get higher weights
    return Math.round(config.min + (1 - proportion) * span);
  } else if (mode === 'popularity') {
    // Common preferences get higher weights
    return Math.round(config.min + proportion * span);
  } else {
    // Balanced: all weights = 3
    return 3;
  }
}

async function autoTuneWeights(storeId?: number, mode: Mode = 'balanced', dryRun: boolean = true) {
  console.log('\n' + '='.repeat(80));
  console.log(`AUTO-TUNING STORE WEIGHTS - MODE: ${mode.toUpperCase()}`);
  console.log('='.repeat(80));
  
  // Fetch all crew with their preferences (optionally filtered by store)
  const allCrew = await prisma.crew.findMany({
    where: storeId ? { storeId } : undefined,
    select: {
      id: true,
      name: true,
      storeId: true,
      prefFirstHour: true,
      prefTask: true,
      prefBreakTiming: true,
    }
  });
  
  console.log(`\nAnalyzing ${allCrew.length} crew members${storeId ? ` for store ${storeId}` : ''}...`);
  
  // Calculate distributions
  const firstHourCounts = { PRODUCT: 0, REGISTER: 0, NONE: 0 };
  const taskCounts = { PRODUCT: 0, REGISTER: 0, NONE: 0 };
  const breakCounts = { early: 0, late: 0, none: 0 };
  
  allCrew.forEach(c => {
    if (c.prefFirstHour) {
      firstHourCounts[c.prefFirstHour]++;
    } else {
      firstHourCounts.NONE++;
    }
    
    if (c.prefTask) {
      taskCounts[c.prefTask]++;
    } else {
      taskCounts.NONE++;
    }
    
    if (c.prefBreakTiming === -1) {
      breakCounts.early++;
    } else if (c.prefBreakTiming === 1) {
      breakCounts.late++;
    } else {
      breakCounts.none++;
    }
  });
  
  const total = allCrew.length;
  
  console.log('\nPreference Distribution:');
  console.log(`  First Hour: PRODUCT=${firstHourCounts.PRODUCT}, REGISTER=${firstHourCounts.REGISTER}, None=${firstHourCounts.NONE}`);
  console.log(`  Task: PRODUCT=${taskCounts.PRODUCT}, REGISTER=${taskCounts.REGISTER}, None=${taskCounts.NONE}`);
  console.log(`  Break: Early=${breakCounts.early}, Late=${breakCounts.late}, None=${breakCounts.none}`);
  
  // Weight configuration (1-5 scale)
  const weightConfig: WeightConfig = { min: 1, max: 5 };
  
  // Calculate proportions
  const productFirstHourProp = firstHourCounts.PRODUCT / total;
  const registerFirstHourProp = firstHourCounts.REGISTER / total;
  const productTaskProp = taskCounts.PRODUCT / total;
  const registerTaskProp = taskCounts.REGISTER / total;
  const earlyBreakProp = breakCounts.early / total;
  const lateBreakProp = breakCounts.late / total;
  
  // Calculate recommended weights
  const weights = {
    productFirstHourWeight: calculateWeight(productFirstHourProp, weightConfig, mode),
    registerFirstHourWeight: calculateWeight(registerFirstHourProp, weightConfig, mode),
    productTaskWeight: calculateWeight(productTaskProp, weightConfig, mode),
    registerTaskWeight: calculateWeight(registerTaskProp, weightConfig, mode),
    earlyBreakWeight: calculateWeight(earlyBreakProp, weightConfig, mode),
    lateBreakWeight: calculateWeight(lateBreakProp, weightConfig, mode),
    consecutiveProdWeight: 3, // Default
    consecutiveRegWeight: 3,  // Default
  };
  
  console.log('\n' + mode.toUpperCase() + ' Mode Weight Assignment:');
  console.log(`  First Hour: PRODUCT=${weights.productFirstHourWeight}, REGISTER=${weights.registerFirstHourWeight}`);
  console.log(`  Task: PRODUCT=${weights.productTaskWeight}, REGISTER=${weights.registerTaskWeight}`);
  console.log(`  Break Timing: Early=${weights.earlyBreakWeight}, Late=${weights.lateBreakWeight}`);
  console.log(`  Consecutive: PRODUCT=${weights.consecutiveProdWeight}, REGISTER=${weights.consecutiveRegWeight}`);
  
  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes made to database');
    console.log('   Run with --apply to actually update store weights');
  } else {
    console.log('\n🔄 Applying weight updates to store(s)...');
    
    const stores = await prisma.store.findMany({
      where: storeId ? { id: storeId } : undefined,
    });
    
    for (const store of stores) {
      await prisma.store.update({
        where: { id: store.id },
        data: weights,
      });
    }
    
    console.log(`✅ Updated ${stores.length} store(s)!`);
  }
  
  console.log('\n' + '='.repeat(80));
  
  return { weights };
}

// Parse command line args
const args = process.argv.slice(2);
const mode = (args.find(a => ['popularity', 'rarity', 'balanced'].includes(a)) || 'balanced') as Mode;
const apply = args.includes('--apply');
const storeArg = args.find(a => a.startsWith('--store='));
const storeId = storeArg ? parseInt(storeArg.split('=')[1]) : undefined;

autoTuneWeights(storeId, mode, !apply)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
