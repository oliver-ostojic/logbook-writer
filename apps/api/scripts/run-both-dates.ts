/**
 * Run solver for both 11-22 and 11-25 and compare results
 */

import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:4000';
const STORE_ID = 768;

async function runSolver(date: string, inputFile: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 Running solver for ${date}`);
  console.log('='.repeat(80) + '\n');

  // Load solver input to get shifts
  const inputPath = path.join(process.cwd(), inputFile);
  if (!fs.existsSync(inputPath)) {
    console.log(`   ⚠️  Solver input file not found: ${inputPath}`);
    console.log(`   Skipping ${date}\n`);
    return;
  }

  const solverInput = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const shifts = solverInput.crew.map((c: any) => ({
    crewId: c.id,
    start: `${Math.floor(c.shiftStartMin / 60)}:${String(c.shiftStartMin % 60).padStart(2, '0')}`,
    end: `${Math.floor(c.shiftEndMin / 60)}:${String(c.shiftEndMin % 60).padStart(2, '0')}`,
  }));

  console.log(`📋 Loaded ${shifts.length} shifts from ${inputFile}\n`);

  // Call solver API
  console.log('🚀 Calling /solve-logbook endpoint...\n');
  
  const response = await fetch(`${API_BASE}/solve-logbook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      store_id: STORE_ID,
      shifts,
      time_limit_seconds: 60,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.log(`   ❌ API request failed: ${error}\n`);
    return;
  }

  const result = await response.json();

  console.log('✅ Solver completed successfully!\n');
  console.log(`   Status: ${result.solver?.metadata?.status}`);
  console.log(`   Runtime: ${result.solver?.metadata?.runtimeMs}ms`);
  console.log(`   Assignments: ${result.solver?.metadata?.numAssignments}`);
  console.log(`   Objective Score: ${result.solver?.metadata?.objectiveScore || 'N/A'}\n`);
}

async function main() {
  const runs = [
    { date: '2025-11-22', inputFile: 'solver_input_11_22.json' },
    { date: '2025-11-25', inputFile: 'solver_input_11_25.json' },
  ];

  for (const run of runs) {
    await runSolver(run.date, run.inputFile);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ All solver runs complete!');
  console.log('='.repeat(80) + '\n');
  console.log('Now run: pnpm dlx ts-node scripts/compare-preference-satisfaction.ts\n');
}

main().catch(console.error);
