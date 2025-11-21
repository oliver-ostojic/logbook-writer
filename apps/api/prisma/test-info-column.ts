/**
 * Test if the info column exists in CrewMemberRole
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Testing CrewMemberRole.info column...\n');

  // Try to query with info field (using any to bypass type cache)
  const result: any = await prisma.crewMemberRole.findFirst({
    select: {
      crewMemberId: true,
      roleId: true,
      info: true,
      crewMember: {
        select: { name: true },
      },
      role: {
        select: { name: true },
      },
    } as any,
  });

  if (result) {
    console.log('✓ Info column exists and is queryable!');
    console.log('\nSample record:');
    console.log(`  Crew: ${result.crewMember.name}`);
    console.log(`  Role: ${result.role.name}`);
    console.log(`  Info: ${result.info || '(null)'}`);
  } else {
    console.log('No records found in CrewMemberRole table.');
  }

  // Also check raw SQL
  console.log('\n\nChecking table structure via raw SQL:');
  const columns: any = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'CrewMemberRole'
    ORDER BY ordinal_position;
  `;
  
  console.log('\nCrewMemberRole columns:');
  columns.forEach((col: any) => {
    console.log(`  ${col.column_name} (${col.data_type}) - nullable: ${col.is_nullable}`);
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
