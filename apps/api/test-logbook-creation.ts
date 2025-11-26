/**
 * Test complete logbook creation workflow with metadata and preference satisfaction
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import {
  saveLogbookWithMetadata,
  createRunRecord,
  getLogbookWithDetails,
  type SolverOutput,
  type SolverInput
} from './src/services/logbook-manager';

const prisma = new PrismaClient();

async function main() {
  const testDate = new Date('2025-11-22');
  const storeId = 768;

  console.log('\n🔍 Testing Complete Logbook Workflow\n');
  console.log(`Store: ${storeId}`);
  console.log(`Date: ${testDate.toISOString().split('T')[0]}\n`);

  // Load solver output from file
  const outputPath = path.join(process.cwd(), 'solver_output_11_22_clean.json');
  const inputPath = path.join(process.cwd(), 'solver_input_11_22.json');

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Solver output file not found: ${outputPath}`);
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Solver input file not found: ${inputPath}`);
  }

  console.log('📂 Loading solver files...');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Input: ${inputPath}\n`);

  const rawOutput = fs.readFileSync(outputPath, 'utf-8');
  const rawInput = fs.readFileSync(inputPath, 'utf-8');

  // Parse and clean output (remove debug logs if present)
  let cleanOutput = rawOutput;
  const jsonStart = rawOutput.indexOf('{');
  if (jsonStart > 0) {
    cleanOutput = rawOutput.substring(jsonStart);
  }

  const solverOutput: SolverOutput = JSON.parse(cleanOutput);
  const solverInput: SolverInput = JSON.parse(rawInput);

  console.log('✅ Files loaded:');
  console.log(`   Status: ${solverOutput.metadata.status}`);
  console.log(`   Runtime: ${solverOutput.metadata.runtimeMs}ms`);
  console.log(`   Assignments: ${solverOutput.metadata.numAssignments}`);
  console.log(`   Preferences in input: ${solverInput.preferences.length}\n`);

  // Create Run record
  console.log('💾 Creating Run record...');
  const runId = await createRunRecord(prisma, {
    storeId,
    date: testDate,
    engine: 'cp-sat-python',
    seed: 0,
    solverOutput,
  });
  console.log(`✅ Run created: ${runId}\n`);

  // Save logbook with all metadata and satisfaction tracking
  console.log('💾 Saving logbook with metadata and preference satisfaction...');
  const logbookId = await saveLogbookWithMetadata(prisma, {
    storeId,
    date: testDate,
    solverOutput,
    solverInput,
    status: 'DRAFT',
  });

  // Update run with logbook reference
  await prisma.run.update({
    where: { id: runId },
    data: { logbookId }
  });

  console.log(`✅ Run linked to logbook\n`);

  // Fetch and display the complete logbook
  console.log('📊 Fetching complete logbook details...\n');
  const logbook = await getLogbookWithDetails(prisma, logbookId);

  if (!logbook) {
    throw new Error('Logbook not found after creation');
  }

  console.log('═'.repeat(80));
  console.log('LOGBOOK DETAILS');
  console.log('═'.repeat(80));
  console.log();
  console.log(`ID: ${logbook.id}`);
  console.log(`Status: ${logbook.status}`);
  console.log(`Date: ${logbook.date.toISOString().split('T')[0]}`);
  console.log(`Generated: ${logbook.generatedAt.toISOString()}`);
  console.log();

  // Display metadata
  const metadata = logbook.metadata as any;
  if (metadata) {
    console.log('METADATA:');
    console.log();
    console.log('Solver:');
    console.log(`  Status: ${metadata.solver.status}`);
    console.log(`  Runtime: ${metadata.solver.runtimeMs}ms`);
    if (metadata.solver.objectiveValue !== undefined) {
      console.log(`  Objective: ${metadata.solver.objectiveValue}`);
    }
    if (metadata.solver.numVariables !== undefined) {
      console.log(`  Variables: ${metadata.solver.numVariables}`);
    }
    if (metadata.solver.numConstraints !== undefined) {
      console.log(`  Constraints: ${metadata.solver.numConstraints}`);
    }
    console.log();

    console.log('Schedule:');
    console.log(`  Total Assignments: ${metadata.schedule.totalAssignments}`);
    console.log(`  Crew Scheduled: ${metadata.schedule.crewScheduled}`);
    console.log(`  Total Hours: ${metadata.schedule.totalHours}h`);
    console.log();

    console.log('Constraints:');
    console.log(`  Hourly: ${metadata.constraints.hourlyConstraints}`);
    console.log(`  Window: ${metadata.constraints.windowConstraints}`);
    console.log(`  Daily: ${metadata.constraints.dailyConstraints}`);
    console.log();

    console.log('Preferences:');
    console.log(`  Total: ${metadata.preferences.total}`);
    console.log(`  Met: ${metadata.preferences.met} (${(metadata.preferences.met / metadata.preferences.total * 100).toFixed(1)}%)`);
    console.log(`  Avg Satisfaction: ${(metadata.preferences.averageSatisfaction * 100).toFixed(1)}%`);
    console.log();
  }

  // Display preference metadata
  if (logbook.preferenceMetadata) {
    console.log('═'.repeat(80));
    console.log('PREFERENCE SATISFACTION SUMMARY');
    console.log('═'.repeat(80));
    console.log();
    console.log(`Total Preferences: ${logbook.preferenceMetadata.totalPreferences}`);
    console.log(`Preferences Met (>50%): ${logbook.preferenceMetadata.preferencesMet}`);
    console.log(`Average Satisfaction: ${(logbook.preferenceMetadata.averageSatisfaction * 100).toFixed(1)}%`);
    console.log(`Total Weight Applied: ${logbook.preferenceMetadata.totalWeightApplied.toFixed(1)}`);
    console.log();
  }

  // Display sample assignments
  console.log('═'.repeat(80));
  console.log('SAMPLE ASSIGNMENTS (first 10)');
  console.log('═'.repeat(80));
  console.log();

  const sampleAssignments = logbook.assignments.slice(0, 10);
  for (const assignment of sampleAssignments) {
    const startTime = assignment.startTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    const endTime = assignment.endTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    console.log(`${assignment.crew.name.padEnd(25)} ${assignment.role.code.padEnd(15)} ${startTime} - ${endTime}`);
  }
  console.log();

  // Display sample preference satisfaction records
  console.log('═'.repeat(80));
  console.log('SAMPLE PREFERENCE SATISFACTION (first 10)');
  console.log('═'.repeat(80));
  console.log();

  const samplePrefs = logbook.preferenceSatisfactions.slice(0, 10);
  for (const pref of samplePrefs) {
    const roleName = pref.rolePreference.role?.code ?? 'N/A';
    const satisfactionPct = (pref.satisfaction * 100).toFixed(1);
    const metIcon = pref.met ? '✓' : '✗';
    console.log(`${metIcon} ${pref.crew.name.padEnd(25)} ${pref.rolePreference.preferenceType.padEnd(15)} ${satisfactionPct}% (${roleName})`);
  }
  console.log();

  // Summary statistics
  const satisfactionByType = new Map<string, { total: number; met: number; avgSat: number }>();
  
  for (const pref of logbook.preferenceSatisfactions) {
    const type = pref.rolePreference.preferenceType;
    if (!satisfactionByType.has(type)) {
      satisfactionByType.set(type, { total: 0, met: 0, avgSat: 0 });
    }
    const stats = satisfactionByType.get(type)!;
    stats.total++;
    if (pref.met) stats.met++;
    stats.avgSat += pref.satisfaction;
  }

  console.log('═'.repeat(80));
  console.log('PREFERENCE SATISFACTION BY TYPE');
  console.log('═'.repeat(80));
  console.log();

  for (const [type, stats] of satisfactionByType) {
    const avgSat = stats.total > 0 ? (stats.avgSat / stats.total * 100).toFixed(1) : '0.0';
    const metPct = stats.total > 0 ? (stats.met / stats.total * 100).toFixed(1) : '0.0';
    console.log(`${type.padEnd(15)} Total: ${stats.total.toString().padStart(3)}  Met: ${stats.met.toString().padStart(3)} (${metPct}%)  Avg: ${avgSat}%`);
  }
  console.log();

  console.log('═'.repeat(80));
  console.log('✅ WORKFLOW COMPLETE');
  console.log('═'.repeat(80));
  console.log();
  console.log('Summary:');
  console.log(`  • Logbook created with ID: ${logbookId}`);
  console.log(`  • ${logbook.assignments.length} assignments saved`);
  console.log(`  • ${logbook.preferenceSatisfactions.length} preference satisfaction records`);
  console.log(`  • Complete metadata stored in Logbook.metadata JSON field`);
  console.log(`  • Aggregate stats in LogPreferenceMetadata table`);
  console.log();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
