import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const roles = [
  'WINE_DEMO',
  'ART_TEAM',
];

async function main() {
  console.log('Seeding roles...');
  
  for (const name of roles) {
    try {
      const role = await prisma.role.create({
        data: {
          name,
        },
      });
      console.log(`✓ Created: ${role.name} (${role.id})`);
    } catch (error: any) {
      console.error(`✗ Failed to create ${name}:`, error.message);
    }
  }
  
  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
