import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map partial names to exact crew full names for unique matching
const NAME_OVERRIDES: Record<string, string> = {
  'Cheri': 'Cheri Reimann',
  'Denise': 'Denise Madrid',
  'Gary': 'Gary Medina',
  'Savannah': 'Savannah Fraijo',
  'Xander': 'Xander Faber',
  'Roger Gomez': 'Roger Gomez',
  'Ashley': 'Ashley Andrejko',
  'Crystal': 'Crystal Rosa',
  'Garet': 'Garet Reimann',
  'Kaylyn': 'Kaylyn Pipitone',
  'Wade': 'Wade Davis',
  'Taylor': 'Taylor Yackulics',
  'Adam Levi': 'Adam Levi',
  'Luki Ahmad': 'Luki Ahmad',
  'Matthew Studebaker': 'Matthew Studebaker',
  'Ofelia': 'Ofelia Aguirre',
  'Tracy': 'Tracy Hopkins',
  'Thalia': 'Thalia Brauner',
};

interface DailyConstraint {
  name: string;
  roleCode: string;
  requiredHours: number;
}

const DAILY_CONSTRAINTS_11_25: DailyConstraint[] = [
  // ORDER_WRITER constraints
  { name: 'Cheri', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Denise', roleCode: 'ORDER_WRITER', requiredHours: 2 },
  { name: 'Gary', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Savannah', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Xander', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Roger Gomez', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Ashley', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Crystal', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Garet', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Kaylyn', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Wade', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Taylor', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Adam Levi', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Luki Ahmad', roleCode: 'ORDER_WRITER', requiredHours: 2 },
  { name: 'Matthew Studebaker', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  { name: 'Ofelia', roleCode: 'ORDER_WRITER', requiredHours: 1 },
  
  // ART constraints
  { name: 'Tracy', roleCode: 'ART', requiredHours: 3.5 },
  { name: 'Thalia', roleCode: 'ART', requiredHours: 4.5 },
];

async function main() {
  const storeId = 768;
  const constraintDate = new Date('2025-11-25');
  
  console.log(`\n🔍 Adding daily constraints for ${constraintDate.toISOString().split('T')[0]}...`);
  console.log(`   Store: ${storeId}`);
  console.log(`   Total constraints to add: ${DAILY_CONSTRAINTS_11_25.length}\n`);

  let created = 0;
  let notFound: string[] = [];

  for (const constraint of DAILY_CONSTRAINTS_11_25) {
    // Get the exact name to search for
    const lookupName = NAME_OVERRIDES[constraint.name] || constraint.name;
    
    // Find the crew member
    const matches = await prisma.crew.findMany({
      where: {
        storeId,
        name: { contains: lookupName, mode: 'insensitive' }
      },
      select: { id: true, name: true }
    });
    
    const crew = matches.length === 1 ? matches[0] : null;
    
    if (!crew) {
      if (matches.length > 1) {
        notFound.push(`${constraint.name} (ambiguous: ${matches.map(m => m.name).join(', ')})`);
      } else {
        notFound.push(constraint.name);
      }
      continue;
    }

    // Find the role
    const role = await prisma.role.findFirst({
      where: {
        storeId,
        code: constraint.roleCode
      }
    });

    if (!role) {
      console.log(`⚠️  Role ${constraint.roleCode} not found for store ${storeId}`);
      continue;
    }

    // Create or update the daily constraint
    await prisma.dailyRoleConstraint.upsert({
      where: {
        storeId_date_crewId_roleId: {
          storeId,
          date: constraintDate,
          crewId: crew.id,
          roleId: role.id
        }
      },
      create: {
        storeId,
        date: constraintDate,
        crewId: crew.id,
        roleId: role.id,
        requiredHours: constraint.requiredHours,
      },
      update: {
        requiredHours: constraint.requiredHours,
      }
    });

    created++;
    console.log(`✓ ${crew.name}: ${constraint.roleCode} = ${constraint.requiredHours}hrs`);
  }

  console.log(`\n✅ Created/updated ${created} daily constraints`);

  if (notFound.length > 0) {
    console.log(`\n⚠️  Could not find ${notFound.length} crew members:`);
    notFound.forEach(name => console.log(`   - ${name}`));
  }

  console.log('\n💡 Note: ART constraints include 3.5 and 4.5 hour blocks.');
  console.log('   These are DAILY roles with blockSize, so they must be scheduled');
  console.log('   consecutively. If a block is too large to fit before/after a meal');
  console.log('   break, the solver may fail unless we add logic to split them.\n');

  console.log('✅ Done!\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
