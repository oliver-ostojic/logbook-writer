import { PrismaClient, PreferenceType } from '@prisma/client';

const prisma = new PrismaClient();

// Store to seed
const STORE_ID = 768;

// Requested (role.code, preferenceType) pairs.
// NOTE: PRODUCT, CONSECUTIVE listed twice in user request -> de-duplicated here.
const PAIRS: Array<{ code: string; preferenceType: PreferenceType }> = [
  { code: 'REGISTER', preferenceType: PreferenceType.FIRST_HOUR },
  { code: 'PRODUCT', preferenceType: PreferenceType.FIRST_HOUR },
  { code: 'ART', preferenceType: PreferenceType.FIRST_HOUR },
  { code: 'REGISTER', preferenceType: PreferenceType.FAVORITE },
  { code: 'PRODUCT', preferenceType: PreferenceType.FAVORITE },
  { code: 'PARKING_HELMS', preferenceType: PreferenceType.TIMING },
  { code: 'BREAK', preferenceType: PreferenceType.TIMING },
  { code: 'PRODUCT', preferenceType: PreferenceType.CONSECUTIVE },
  { code: 'REGISTER', preferenceType: PreferenceType.CONSECUTIVE },
];

// Assumed base weights (can be tuned later). These map to solver store-level aggregation.
const DEFAULT_WEIGHTS: Record<PreferenceType, number> = {
  [PreferenceType.FIRST_HOUR]: 1000,
  [PreferenceType.FAVORITE]: 200,
  [PreferenceType.TIMING]: 40,
  [PreferenceType.CONSECUTIVE]: 40,
};

async function main() {
  console.log(`Seeding role preferences for store ${STORE_ID}...`);

  // Fetch roles for codes present in PAIRS
  const neededCodes = [...new Set(PAIRS.map(p => p.code))];
  const roles = await prisma.role.findMany({
    where: { storeId: STORE_ID, code: { in: neededCodes } },
    select: { id: true, code: true },
  });
  const roleByCode = new Map(roles.map(r => [r.code, r.id]));

  // Validate all codes exist
  const missing = neededCodes.filter(code => !roleByCode.has(code));
  if (missing.length) {
    throw new Error(`Missing roles in DB for codes: ${missing.join(', ')}`);
  }

  // Upsert each role preference (unique on storeId+roleId+preferenceType)
  let created = 0;
  let updated = 0;
  for (const { code, preferenceType } of PAIRS) {
    const roleId = roleByCode.get(code)!;
    const baseWeight = DEFAULT_WEIGHTS[preferenceType] ?? 1;

    await prisma.rolePreference.upsert({
      where: {
        storeId_roleId_preferenceType: {
          storeId: STORE_ID,
          roleId,
          preferenceType,
        },
      },
      update: {
        baseWeight,
        allowBanking: true,
      },
      create: {
        storeId: STORE_ID,
        roleId,
        preferenceType,
        baseWeight,
        allowBanking: true,
      },
    }).then(() => {
      // No direct way to know if create vs update from upsert return; could re-query but not critical.
      // For approximate counts, attempt a find first (optional). We keep simple logging instead.
      console.log(`Upserted (${code}, ${preferenceType}) baseWeight=${baseWeight}`);
    });
  }

  console.log(`Finished seeding ${PAIRS.length} role preferences.`);
}

main()
  .catch(err => {
    console.error('Error seeding role preferences:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
