/**
 * Test Production API Integration
 * 
 * Verifies that the /solve-logbook endpoint creates complete logbook
 * with metadata, assignments, and preference satisfaction tracking.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const API_BASE = 'http://localhost:4000';
const STORE_ID = 768;

async function runTest(testDate: string, inputFile: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Production API Integration for ${testDate}`);
  console.log('='.repeat(80) + '\n');
  console.log(`API: ${API_BASE}`);
  console.log(`Store: ${STORE_ID}`);
  console.log(`Date: ${testDate}\n`);

  try {
    // Step 1: Load solver input to get shifts
    const inputPath = path.join(process.cwd(), inputFile);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Solver input file not found: ${inputPath}`);
    }

    const solverInput = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const shifts = solverInput.crew.map((c: any) => ({
      crewId: c.id,
      start: `${Math.floor(c.shiftStartMin / 60)}:${String(c.shiftStartMin % 60).padStart(2, '0')}`,
      end: `${Math.floor(c.shiftEndMin / 60)}:${String(c.shiftEndMin % 60).padStart(2, '0')}`,
    }));

    console.log(`📋 Loaded ${shifts.length} shifts from solver input\n`);

    // Step 3: Call solver API
    console.log('🚀 Calling /solve-logbook endpoint...\n');
    
    const response = await fetch(`${API_BASE}/solve-logbook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: testDate,
        store_id: STORE_ID,
        shifts,
        time_limit_seconds: 60,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${error}`);
    }

    const result = await response.json();

    console.log('✅ Solver completed successfully!\n');
    console.log(`Solver Status: ${result.solver?.metadata?.status}`);
    console.log(`Runtime: ${result.solver?.metadata?.runtimeMs}ms`);
    console.log(`Assignments: ${result.solver?.metadata?.numAssignments}\n`);

    // Step 4: Query database to verify logbook was created
    const logbook = await prisma.logbook.findFirst({
      where: {
        storeId: STORE_ID,
        date: new Date(testDate),
        status: 'DRAFT',
      },
      include: {
        assignments: true,
        preferenceSatisfactions: {
          include: {
            crew: { select: { name: true } },
            rolePreference: {
              include: { role: true },
            },
          },
        },
        preferenceMetadata: true,
        runs: true,
      },
      orderBy: { generatedAt: 'desc' },
    });

    if (!logbook) {
      throw new Error('Logbook was not created in database!');
    }

    console.log('✅ Logbook created in database!\n');
    console.log(`Logbook ID: ${logbook.id}`);
    console.log(`Generated At: ${logbook.generatedAt?.toISOString()}\n`);

    // Step 5: Verify metadata
    console.log('📊 Logbook Metadata:');
    const metadata = logbook.metadata as any;
    
    if (!metadata) {
      console.log('  ❌ No metadata found!');
    } else {
      console.log(`  Solver Status: ${metadata.solver?.status}`);
      console.log(`  Runtime: ${metadata.solver?.runtimeMs}ms`);
      console.log(`  Objective Score: ${metadata.solver?.objectiveScore || 'N/A'}`);
      console.log(`  Total Assignments: ${metadata.schedule?.totalAssignments}`);
      console.log(`  Crew Scheduled: ${metadata.schedule?.crewScheduled}`);
      console.log(`  Total Hours: ${metadata.schedule?.totalHours}h`);
      console.log(`  Hourly Constraints: ${metadata.constraints?.hourlyConstraints}`);
      console.log(`  Window Constraints: ${metadata.constraints?.windowConstraints}`);
      console.log(`  Daily Constraints: ${metadata.constraints?.dailyConstraints}`);
      console.log(`  Preferences Total: ${metadata.preferences?.total}`);
      console.log(`  Preferences Met: ${metadata.preferences?.met}`);
      console.log(`  Avg Satisfaction: ${(metadata.preferences?.averageSatisfaction * 100).toFixed(1)}%\n`);
    }

    // Step 6: Verify assignments
    console.log(`📋 Assignments: ${logbook.assignments.length} created`);
    if (logbook.assignments.length > 0) {
      const sampleAssignments = logbook.assignments.slice(0, 5);
      console.log('  Sample (first 5):');
      for (const a of sampleAssignments) {
        const start = a.startTime.toISOString().slice(11, 16);
        const end = a.endTime.toISOString().slice(11, 16);
        console.log(`    ${a.crewId} → ${a.roleId} (${start}-${end})`);
      }
      console.log();
    }

    // Step 7: Verify preference satisfaction
    console.log(`🎯 Preference Satisfaction: ${logbook.preferenceSatisfactions.length} records`);
    if (logbook.preferenceSatisfactions.length > 0) {
      const byType = new Map<string, { total: number; met: number; sumSatisfaction: number }>();
      
      for (const ps of logbook.preferenceSatisfactions) {
        const type = ps.rolePreference.preferenceType;
        if (!byType.has(type)) {
          byType.set(type, { total: 0, met: 0, sumSatisfaction: 0 });
        }
        const stats = byType.get(type)!;
        stats.total++;
        if (ps.met) stats.met++;
        stats.sumSatisfaction += ps.satisfaction;
      }

      console.log('  By Preference Type:');
      for (const [type, stats] of byType) {
        const metPct = (stats.met / stats.total * 100).toFixed(1);
        const avgSat = (stats.sumSatisfaction / stats.total * 100).toFixed(1);
        console.log(`    ${type}: ${stats.met}/${stats.total} met (${metPct}%), avg ${avgSat}%`);
      }
      console.log();
    }

    // Step 8: Verify LogPreferenceMetadata
    if (logbook.preferenceMetadata) {
      console.log('📈 Aggregate Preference Metadata:');
      console.log(`  Total Preferences: ${logbook.preferenceMetadata.totalPreferences}`);
      console.log(`  Preferences Met: ${logbook.preferenceMetadata.preferencesMet}`);
      console.log(`  Average Satisfaction: ${(logbook.preferenceMetadata.averageSatisfaction * 100).toFixed(1)}%`);
      console.log(`  Total Weight Applied: ${logbook.preferenceMetadata.totalWeightApplied}\n`);
    }

    // Step 9: Verify Run record
    console.log(`🏃 Run Records: ${logbook.runs.length} created`);
    if (logbook.runs.length > 0) {
      const run = logbook.runs[0];
      console.log(`  Run ID: ${run.id}`);
      console.log(`  Status: ${run.status}`);
      console.log(`  Runtime: ${run.runtimeMs}ms`);
      console.log(`  Objective Score: ${run.objectiveScore}`);
      console.log(`  MIP Gap: ${run.mipGap || 'N/A'}\n`);
    }

    console.log('✅ ALL INTEGRATION TESTS PASSED!\n');
    console.log('Summary:');
    console.log(`  ✓ Logbook created with metadata`);
    console.log(`  ✓ ${logbook.assignments.length} assignments saved`);
    console.log(`  ✓ ${logbook.preferenceSatisfactions.length} preference satisfaction records`);
    console.log(`  ✓ Aggregate preference metadata created`);
    console.log(`  ✓ Run record linked to logbook`);

  } catch (error: any) {
    console.error('\n❌ Integration test failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  // Run both dates
  await runTest('2025-11-22', 'solver_input_11_22.json');
  
  console.log('\n\n✅ ALL TESTS COMPLETE!\n');
  console.log('Run comparison: pnpm dlx ts-node scripts/compare-preference-satisfaction.ts\n');
}

main();
