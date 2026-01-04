import { PrismaClient } from '@prisma/client';
import { buildSolverInputV2 } from '../src/solver2/builder';

async function main() {
  const prisma = new PrismaClient();
  try {
    const out = await buildSolverInputV2({
      storeId: 768,
      date: new Date('2025-12-16'),
    });

    const rr = out.roleRules.filter(
      (r: (typeof out.roleRules)[number]) =>
        r.type === 'MAX_CONSECUTIVE_MINUTES' &&
        r.roleCode === 'REG' &&
        (r.crewId === '1287114' || r.crewId === '1269079')
    );

    console.log('count', rr.length);
    console.log(
      rr.map((r: (typeof out.roleRules)[number]) => ({
        crewId: r.crewId,
        source: r.source,
        id: r.id,
        roleRuleId: r.roleRuleId,
        valueInt: r.valueInt,
        isPriority: r.isPriority,
      }))
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  throw e;
});
