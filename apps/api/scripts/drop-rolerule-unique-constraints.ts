import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Migration: Remove unique constraints from CrewRoleRule and StoreRoleRule\n');

  // Drop CrewRoleRule unique constraint
  console.log('1. Dropping CrewRoleRule unique constraint...');
  try {
    await prisma.$executeRaw`
      ALTER TABLE "CrewRoleRule" DROP CONSTRAINT IF EXISTS "CrewRoleRule_crewId_roleRuleId_key"
    `;
    console.log('   ✅ Dropped CrewRoleRule unique constraint');
  } catch (e: any) {
    console.log(`   ⚠️  May not exist: ${e.message}`);
  }

  // Drop StoreRoleRule unique constraint
  console.log('\n2. Dropping StoreRoleRule unique constraint...');
  try {
    await prisma.$executeRaw`
      ALTER TABLE "StoreRoleRule" DROP CONSTRAINT IF EXISTS "StoreRoleRule_storeId_roleRuleId_key"
    `;
    console.log('   ✅ Dropped StoreRoleRule unique constraint');
  } catch (e: any) {
    console.log(`   ⚠️  May not exist: ${e.message}`);
  }

  // Verify
  console.log('\n3. Verifying constraints...');
  
  const crewConstraints = await prisma.$queryRaw<{ constraint_name: string }[]>`
    SELECT constraint_name FROM information_schema.table_constraints 
    WHERE table_name = 'CrewRoleRule' AND constraint_type = 'UNIQUE'
  `;
  console.log(`   CrewRoleRule unique constraints: ${crewConstraints.length === 0 ? 'None ✅' : crewConstraints.map(c => c.constraint_name).join(', ')}`);

  const storeConstraints = await prisma.$queryRaw<{ constraint_name: string }[]>`
    SELECT constraint_name FROM information_schema.table_constraints 
    WHERE table_name = 'StoreRoleRule' AND constraint_type = 'UNIQUE'
  `;
  console.log(`   StoreRoleRule unique constraints: ${storeConstraints.length === 0 ? 'None ✅' : storeConstraints.map(c => c.constraint_name).join(', ')}`);

  console.log('\n✅ Migration complete!');
  console.log('\nNow you can have multiple StoreRoleRule/CrewRoleRule entries for the same roleRuleId with different valueInt values.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
