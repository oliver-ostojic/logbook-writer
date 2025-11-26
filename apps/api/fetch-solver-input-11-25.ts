/**
 * Fetch solver input from API for 11-25
 */

import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:4000/solver/input/768/2025-11-25';
const OUTPUT_FILE = path.join(process.cwd(), 'solver_input_11_25.json');

async function main() {
  console.log('🔍 Fetching solver input from API for 2025-11-25...');
  console.log(`   URL: ${API_URL}\n`);

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`API error: ${result.error}`);
    }

    const solverInput = result.data;

    console.log('✅ Solver input received:');
    console.log(`   Crew members: ${solverInput.crew?.length || 0}`);
    console.log(`   Preferences: ${solverInput.preferences?.length || 0}`);
    console.log(`   Hourly requirements: ${solverInput.hourlyRequirements?.length || 0}`);
    console.log(`   Crew role requirements: ${solverInput.crewRoleRequirements?.length || 0}`);
    console.log(`   Coverage windows: ${solverInput.coverageWindows?.length || 0}\n`);

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(solverInput, null, 2));
    console.log(`💾 Saved to: ${OUTPUT_FILE}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
