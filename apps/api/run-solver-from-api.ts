/**
 * Fetch solver input from API and run Python solver
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:4000/solver/input/768/2025-11-22';
const OUTPUT_FILE = path.join(process.cwd(), 'solver_input_11_22.json');
const SOLVER_DIR = path.join(process.cwd(), '..', 'solver-python');

async function main() {
  console.log('🔍 Fetching solver input from API...');
  console.log(`   URL: ${API_URL}\n`);

  // Fetch data from API
  const response = await fetch(API_URL);
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error('API returned error');
  }

  const solverInput = result.data;
  const metadata = result.metadata;

  console.log('✅ Data received:');
  console.log(`   Store: ${metadata.storeName} (${metadata.storeId})`);
  console.log(`   Date: ${metadata.date}`);
  console.log(`   Crew: ${metadata.crewCount} with shifts (${metadata.crewWithoutShifts} without)`);
  console.log(`   Roles: ${metadata.roleCount}`);
  console.log(`   Preferences: ${metadata.preferenceCount}`);
  console.log(`   Constraints:`);
  console.log(`     - Hourly: ${metadata.constraintCounts.hourly}`);
  console.log(`     - Window: ${metadata.constraintCounts.window}`);
  console.log(`     - Daily: ${metadata.constraintCounts.daily}`);

  // Save to file
  console.log(`\n💾 Saving to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(solverInput, null, 2));
  console.log('✅ File saved');

  // Run Python solver
  console.log('\n🐍 Running Python solver...');
  console.log(`   Working directory: ${SOLVER_DIR}`);
  
  const venvPython = path.join(SOLVER_DIR, 'venv', 'bin', 'python');
  const solverScript = path.join(SOLVER_DIR, 'solver.py');
  const pythonCmd = `${venvPython} ${solverScript} < ${OUTPUT_FILE}`;
  console.log(`   Command: ${pythonCmd}\n`);
  
  try {
    const output = execSync(pythonCmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    
    console.log('📊 Solver Output:');
    console.log('═'.repeat(80));
    console.log(output);
    console.log('═'.repeat(80));
    
  } catch (error: any) {
    console.error('❌ Solver failed:');
    console.error(error.stderr || error.message);
    process.exit(1);
  }

  console.log('\n✅ Complete!');
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
