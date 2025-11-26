import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const names = [
    'Aaron',
    'Patricia',
    'Cheri',
    'Lindsey',
    'Jill',
    'Emma',
    'Daniel',
    'Morgan',
    'Ofelia'
  ];

  console.log('🔍 Searching for crew members by name...\n');

  for (const name of names) {
    const crew = await prisma.crew.findMany({
      where: {
        name: {
          contains: name,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true
      }
    });

    if (crew.length === 0) {
      console.log(`❌ ${name}: Not found`);
    } else if (crew.length === 1) {
      console.log(`✅ ${name}: ${crew[0].id} (${crew[0].name})`);
    } else {
      console.log(`⚠️  ${name}: Multiple matches found:`);
      crew.forEach(c => console.log(`   - ${c.id} (${c.name})`));
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
