import fs from 'fs';
import path from 'path';

const storeId = process.argv[2] ?? '768';
const date = process.argv[3] ?? '2025-11-25';
const outputFile =
  process.argv[4] ?? path.join(process.cwd(), `solver_input_v2_${storeId}_${date}.json`);
const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
const apiUrl = `${apiBase.replace(/\/$/, '')}/solver/v2/input?storeId=${storeId}&date=${date}`;

async function main() {
  console.log(`🔍 Fetching SolverInputV2 for store ${storeId} on ${date}...`);
  console.log(`   URL: ${apiUrl}\n`);

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`API error: ${result.error || 'unknown error'}`);
    }

    const solverInput = result.data;

    console.log('✅ Solver input received:');
    console.log(`   Crew members: ${solverInput.crew?.length || 0}`);
    console.log(`   Preferences: ${solverInput.preferences?.length || 0}`);
    console.log(`   Hourly requirements: ${solverInput.hourlyRequirements?.length || 0}`);
    console.log(`   Daily requirements: ${solverInput.dailyRequirements?.length || 0}`);
    console.log(`   Coverage windows: ${solverInput.windowRequirements?.length || 0}\n`);

    // Save to file
    fs.writeFileSync(outputFile, JSON.stringify(solverInput, null, 2));
    console.log(`💾 Saved to: ${outputFile}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
