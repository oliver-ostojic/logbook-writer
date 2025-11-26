/**
 * Check solver output for a specific date
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:4000';
const STORE_ID = 768;
const DATE = '2025-11-22';

async function main() {
  console.log(`\n🔍 Fetching solver output for ${DATE}...\n`);

  try {
    // Fetch shifts from database
    const shifts = await prisma.shift.findMany({
      where: {
        storeId: STORE_ID,
        date: new Date(DATE),
      },
      include: {
        crew: true,
      },
    });

    if (shifts.length === 0) {
      console.log('❌ No shifts found for this date. Run add-shifts-11-22.ts first.');
      process.exit(1);
    }

    console.log(`✅ Found ${shifts.length} shifts`);

    // Format shifts for API
    const formattedShifts = shifts.map((s) => ({
      crewId: s.crewId,
      start: `${Math.floor(s.startMin / 60).toString().padStart(2, '0')}:${(s.startMin % 60).toString().padStart(2, '0')}`,
      end: `${Math.floor(s.endMin / 60).toString().padStart(2, '0')}:${(s.endMin % 60).toString().padStart(2, '0')}`,
    }));

    console.log(`\n📤 Calling solver API...\n`);

    // Call solver API
    const response = await fetch(`${API_URL}/solve-logbook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: DATE,
        store_id: STORE_ID,
        shifts: formattedShifts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Solver API error:', error);
      process.exit(1);
    }

    const result = await response.json();

    console.log('📊 SOLVER OUTPUT:\n');
    console.log(JSON.stringify(result, null, 2));

    // Print summary
    if (result.solver?.metadata) {
      const meta = result.solver.metadata;
      console.log('\n\n📈 SUMMARY:');
      console.log(`  Status: ${meta.status}`);
      console.log(`  Runtime: ${meta.runtimeMs}ms`);
      console.log(`  Objective Score: ${meta.objectiveScore || 'N/A'}`);
      console.log(`  MIP Gap: ${meta.mipGap || 'N/A'}`);
      console.log(`  Assignments: ${meta.numAssignments || 0}`);
      console.log(`  Violations: ${meta.violations?.length || 0}`);
      
      if (meta.violations && meta.violations.length > 0) {
        console.log('\n⚠️  VIOLATIONS:');
        meta.violations.forEach((v: string) => console.log(`    - ${v}`));
      }
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
