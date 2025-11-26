/**
 * Compare preference satisfaction across multiple solver runs
 * Shows before/after improvements for FIRST_HOUR and TIMING
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE = 'http://localhost:4000';
const STORE_ID = 768;

interface RunResult {
  date: string;
  logbookId: string;
  generatedAt: Date;
  metadata: {
    solver: {
      status: string;
      runtimeMs: number;
      objectiveScore?: number;
    };
    preferences: {
      total: number;
      met: number;
      averageSatisfaction: number;
    };
  };
  byType: Map<string, { total: number; met: number; avgSatisfaction: number }>;
}

async function fetchAndCompare(dates: string[]) {
  console.log('📊 Preference Satisfaction Comparison\n');
  console.log('=' .repeat(80) + '\n');

  const results: RunResult[] = [];

  for (const date of dates) {
    console.log(`📅 Processing date: ${date}`);

    // Get most recent logbook for this date
    const logbook = await prisma.logbook.findFirst({
      where: { storeId: STORE_ID, date: new Date(date), status: 'DRAFT' },
      include: {
        preferenceSatisfactions: {
          include: { rolePreference: true }
        }
      },
      orderBy: { generatedAt: 'desc' }
    });

    if (!logbook) {
      console.log(`   ⚠️  No logbook found for ${date}\n`);
      continue;
    }

    const metadata = logbook.metadata as any;
    
    // Calculate by-type stats
    const byType = new Map<string, { total: number; met: number; avgSatisfaction: number }>();
    
    for (const ps of logbook.preferenceSatisfactions) {
      const type = ps.rolePreference.preferenceType;
      if (!byType.has(type)) {
        byType.set(type, { total: 0, met: 0, avgSatisfaction: 0 });
      }
      const stats = byType.get(type)!;
      stats.total++;
      if (ps.met) stats.met++;
      stats.avgSatisfaction += ps.satisfaction;
    }

    // Compute averages
    for (const [type, stats] of byType) {
      stats.avgSatisfaction = stats.avgSatisfaction / stats.total;
    }

    results.push({
      date,
      logbookId: logbook.id,
      generatedAt: logbook.generatedAt!,
      metadata: {
        solver: metadata.solver,
        preferences: metadata.preferences
      },
      byType
    });

    console.log(`   ✅ Logbook: ${logbook.id}`);
    console.log(`   Generated: ${logbook.generatedAt?.toISOString()}`);
    console.log(`   Preferences: ${metadata.preferences.met}/${metadata.preferences.total} met (${(metadata.preferences.averageSatisfaction * 100).toFixed(1)}%)\n`);
  }

  if (results.length === 0) {
    console.log('No results to compare!\n');
    return;
  }

  // Print comparison table
  console.log('\n' + '='.repeat(80));
  console.log('PREFERENCE TYPE COMPARISON');
  console.log('='.repeat(80) + '\n');

  const types = ['FIRST_HOUR', 'FAVORITE', 'TIMING', 'CONSECUTIVE'];

  for (const type of types) {
    console.log(`\n📌 ${type}`);
    console.log('-'.repeat(80));
    console.log(`${'Date'.padEnd(12)} | ${'Met'.padEnd(12)} | ${'Avg Satisfaction'.padEnd(20)} | ${'Generated At'.padEnd(20)}`);
    console.log('-'.repeat(80));

    for (const result of results) {
      const stats = result.byType.get(type);
      if (!stats) {
        console.log(`${result.date.padEnd(12)} | ${'N/A'.padEnd(12)} | ${'N/A'.padEnd(20)} | ${result.generatedAt.toISOString().slice(0, 19)}`);
        continue;
      }

      const metPct = (stats.met / stats.total * 100).toFixed(1);
      const avgSat = (stats.avgSatisfaction * 100).toFixed(1);
      const metStr = `${stats.met}/${stats.total} (${metPct}%)`;
      
      console.log(
        `${result.date.padEnd(12)} | ${metStr.padEnd(12)} | ${(avgSat + '%').padEnd(20)} | ${result.generatedAt.toISOString().slice(0, 19)}`
      );
    }
  }

  // Print overall summary
  console.log('\n' + '='.repeat(80));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(80) + '\n');

  console.log(`${'Date'.padEnd(12)} | ${'Total Met'.padEnd(15)} | ${'Avg Satisfaction'.padEnd(20)} | ${'Objective Score'.padEnd(20)}`);
  console.log('-'.repeat(80));

  for (const result of results) {
    const metPct = (result.metadata.preferences.met / result.metadata.preferences.total * 100).toFixed(1);
    const metStr = `${result.metadata.preferences.met}/${result.metadata.preferences.total} (${metPct}%)`;
    const avgSat = (result.metadata.preferences.averageSatisfaction * 100).toFixed(1) + '%';
    const objScore = result.metadata.solver.objectiveScore?.toString() || 'N/A';
    
    console.log(
      `${result.date.padEnd(12)} | ${metStr.padEnd(15)} | ${avgSat.padEnd(20)} | ${objScore.padEnd(20)}`
    );
  }

  console.log('\n');
}

async function main() {
  const dates = ['2025-11-22', '2025-11-25'];
  
  await fetchAndCompare(dates);
  
  await prisma.$disconnect();
}

main().catch(console.error);
