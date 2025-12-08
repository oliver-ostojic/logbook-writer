import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { buildSolverInputV2 } from '../src/solver2/builder';

async function main() {
  const storeId = Number(process.argv[2] ?? '768');
  const date = process.argv[3] ?? '2025-11-25';
  const outPath = process.argv[4] ?? path.join(process.cwd(), `solver_input_live_${storeId}_${date}.json`);

  const prisma = new PrismaClient();

  try {
    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);

    const shiftsFromDb = await prisma.shift.findMany({
      where: { storeId, date: day },
      orderBy: [{ crewId: 'asc' }],
    });

    if (shiftsFromDb.length === 0) {
      throw new Error(`No shifts found for store ${storeId} on ${date}.`);
    }

    const solverInput = await buildSolverInputV2({ storeId, date });

    fs.writeFileSync(outPath, JSON.stringify(solverInput, null, 2));
    console.log(`✅ Solver input saved to ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed to dump solver input:', err);
  process.exit(1);
});
