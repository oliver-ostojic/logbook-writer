import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;

// ORDER_WRITER specializations (17 options for 37 crew)
const ORDER_WRITER_SPECS = [
  'HABA',
  'Displays',
  'Bread',
  'Cold Produce',
  'Dry Produce',
  'Beverage',
  'Deli',
  'Cheese',
  'Cookie/Candy',
  'Frozen',
  'Coffee/Tea',
  'Wine',
  'DFN',
  'Snacks',
  'Grocery',
  'Cereal/Bar',
  'Box',
];

// ART specializations
const ART_SPECS = {
  Decor: 4,
  Signs: 3,
};

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  console.log(`Assigning crew roles for store ${STORE_ID}...`);

  // Fetch all crew from DB (after user removed duplicates)
  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    select: { id: true, name: true },
  });

  console.log(`Found ${allCrew.length} crew members in DB.`);
  console.log(`Note: Crew can be assigned to multiple roles, so we'll distribute across all.`);

  // Fetch role IDs
  const roles = await prisma.role.findMany({
    where: {
      storeId: STORE_ID,
      code: { in: ['ORDER_WRITER', 'DEMO', 'WINE_DEMO', 'ART'] },
    },
    select: { id: true, code: true },
  });
  const roleByCode = new Map(roles.map(r => [r.code, r.id]));

  const orderWriterId = roleByCode.get('ORDER_WRITER');
  const demoId = roleByCode.get('DEMO');
  const wineDemoId = roleByCode.get('WINE_DEMO');
  const artId = roleByCode.get('ART');

  if (!orderWriterId || !demoId || !wineDemoId || !artId) {
    throw new Error('Missing required roles in DB: ORDER_WRITER, DEMO, WINE_DEMO, ART');
  }

  // Shuffle crew for random assignment
  const shuffled = shuffleArray(allCrew);

  // --- ORDER_WRITER (37) randomly assigned ---
  console.log('Assigning 37 ORDER_WRITER crew with random specializations...');
  const orderWriterCrew = shuffled.slice(0, 37);
  for (let i = 0; i < orderWriterCrew.length; i++) {
    const crew = orderWriterCrew[i];
    const specialization = ORDER_WRITER_SPECS[i % ORDER_WRITER_SPECS.length];
    await prisma.crewRole.upsert({
      where: {
        crewId_roleId: { crewId: crew.id, roleId: orderWriterId },
      },
      update: {
        specialization: specialization,
        crewName: crew.name,
        roleName: 'ORDER_WRITER',
      },
      create: {
        crewId: crew.id,
        roleId: orderWriterId,
        specialization: specialization,
        crewName: crew.name,
        roleName: 'ORDER_WRITER',
      },
    });
  }

  // --- DEMO/WINE_DEMO (30 overlap, 3 DEMO-only) ---
  console.log('Assigning DEMO/WINE_DEMO crew (30 get both, 3 get DEMO-only)...');
  const demoWineCrew = shuffleArray(allCrew).slice(0, 30);
  const demoOnlyCrew = shuffleArray(allCrew.filter(c => !demoWineCrew.includes(c))).slice(0, 3);

  // 30 crew get both DEMO and WINE_DEMO
  for (const crew of demoWineCrew) {
    await prisma.crewRole.upsert({
      where: {
        crewId_roleId: { crewId: crew.id, roleId: demoId },
      },
      update: {
        crewName: crew.name,
        roleName: 'DEMO',
      },
      create: {
        crewId: crew.id,
        roleId: demoId,
        crewName: crew.name,
        roleName: 'DEMO',
      },
    });

    await prisma.crewRole.upsert({
      where: {
        crewId_roleId: { crewId: crew.id, roleId: wineDemoId },
      },
      update: {
        crewName: crew.name,
        roleName: 'WINE_DEMO',
      },
      create: {
        crewId: crew.id,
        roleId: wineDemoId,
        crewName: crew.name,
        roleName: 'WINE_DEMO',
      },
    });
  }

  // 3 crew get DEMO-only
  for (const crew of demoOnlyCrew) {
    await prisma.crewRole.upsert({
      where: {
        crewId_roleId: { crewId: crew.id, roleId: demoId },
      },
      update: {
        crewName: crew.name,
        roleName: 'DEMO',
      },
      create: {
        crewId: crew.id,
        roleId: demoId,
        crewName: crew.name,
        roleName: 'DEMO',
      },
    });
  }

  // --- ART (7: 4 Decor, 3 Signs) randomly assigned ---
  console.log('Assigning 7 ART crew (4 Decor, 3 Signs)...');
  const artCrew = shuffleArray(allCrew).slice(0, 7);
  let artCount = 0;
  let artIdx = 0;
  for (const [spec, count] of Object.entries(ART_SPECS)) {
    for (let i = 0; i < count; i++) {
      const crew = artCrew[artIdx++];
      artCount++;
      await prisma.crewRole.upsert({
        where: {
          crewId_roleId: { crewId: crew.id, roleId: artId },
        },
        update: {
          specialization: spec,
          crewName: crew.name,
          roleName: 'ART',
        },
        create: {
          crewId: crew.id,
          roleId: artId,
          specialization: spec,
          crewName: crew.name,
          roleName: 'ART',
        },
      });
    }
  }

  console.log(`Successfully assigned crew roles:`);
  console.log(`  - ORDER_WRITER: 37`);
  console.log(`  - DEMO: 33`);
  console.log(`  - WINE_DEMO: 30`);
  console.log(`  - ART: ${artCount} (4 Decor, 3 Signs)`);
}

main()
  .catch(err => {
    console.error('Error seeding crew roles:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
