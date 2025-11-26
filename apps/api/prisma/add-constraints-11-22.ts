import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  const date = new Date('2025-11-22T00:00:00.000Z');

  // Get roles
  const demoRole = await prisma.role.findUnique({ where: { code: 'DEMO' } });
  const wineDemoRole = await prisma.role.findUnique({ where: { code: 'WINE_DEMO' } });
  const registerRole = await prisma.role.findUnique({ where: { code: 'REGISTER' } });
  const orderWriterRole = await prisma.role.findUnique({ where: { code: 'ORDER_WRITER' } });

  if (!demoRole || !wineDemoRole || !registerRole || !orderWriterRole) {
    console.log('❌ Required roles not found');
    return;
  }

  console.log('📅 Adding constraints for 11/22/25...\n');

  // 1. WindowRoleConstraints (DEMO and WINE_DEMO)
  console.log('Adding WindowRoleConstraints for Demo roles...');
  
  // Demo - 10 AM to 7 PM
  try {
    await prisma.windowRoleConstraint.upsert({
      where: {
        storeId_date_roleId: {
          storeId,
          date,
          roleId: demoRole.id
        }
      },
      update: {
        startHour: 10,
        endHour: 19,
        requiredPerHour: 1
      },
      create: {
        storeId,
        date,
        roleId: demoRole.id,
        startHour: 10,
        endHour: 19,
        requiredPerHour: 1
      }
    });
    console.log('✅ Demo: 10 AM to 7 PM');
  } catch (error: any) {
    console.log(`❌ Error adding Demo window: ${error.message}`);
  }

  // Wine Demo - 10 AM to 5 PM
  try {
    await prisma.windowRoleConstraint.upsert({
      where: {
        storeId_date_roleId: {
          storeId,
          date,
          roleId: wineDemoRole.id
        }
      },
      update: {
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1
      },
      create: {
        storeId,
        date,
        roleId: wineDemoRole.id,
        startHour: 10,
        endHour: 17,
        requiredPerHour: 1
      }
    });
    console.log('✅ Wine Demo: 10 AM to 5 PM');
  } catch (error: any) {
    console.log(`❌ Error adding Wine Demo window: ${error.message}`);
  }
  
  // 2. HourlyRoleConstraints (REGISTER)
  console.log('\nAdding HourlyRoleConstraints for REGISTER...');
  
  const registerHours = [
    { hour: 8, required: 7 },
    { hour: 9, required: 8 },
    { hour: 10, required: 11 },
    { hour: 11, required: 12 },
    { hour: 12, required: 14 },
    { hour: 13, required: 13 },
    { hour: 14, required: 14 },
    { hour: 15, required: 12 },
    { hour: 16, required: 13 },
    { hour: 17, required: 10 },
    { hour: 18, required: 10 },
    { hour: 19, required: 10 },
    { hour: 20, required: 8 }
  ];

  for (const { hour, required } of registerHours) {
    try {
      await prisma.hourlyRoleConstraint.upsert({
        where: {
          storeId_date_hour_roleId: {
            storeId,
            date,
            hour,
            roleId: registerRole.id
          }
        },
        update: {
          requiredPerHour: required
        },
        create: {
          storeId,
          date,
          hour,
          roleId: registerRole.id,
          requiredPerHour: required
        }
      });
      console.log(`✅ Register ${hour}:00 - ${required} crew`);
    } catch (error: any) {
      console.log(`❌ Error adding Register hour ${hour}: ${error.message}`);
    }
  }

  // 3. DailyRoleConstraints (ORDER_WRITER)
  console.log('\nAdding DailyRoleConstraints for ORDER_WRITER...');
  
  const orderWriters = [
    { name: 'Aaron Haverstock', id: '1269091', hours: 1 },
    { name: 'Adam Carey', id: '1289515', hours: 1 },
    { name: 'Patricia Edgar', id: '1281338', hours: 1 },
    { name: 'Cheri Reimann', id: '1281919', hours: 1 },
    { name: 'Hannah', id: '1285308', hours: 1 },
    { name: 'Lindsey Wellington', id: '1284569', hours: 1 },
    { name: 'Ashley', id: '1283622', hours: 1 },
    { name: 'Denise', id: '1280703', hours: 2 },
    { name: 'Jill Sachs', id: '1285995', hours: 1 },
    { name: 'Emma Boles', id: '1286326', hours: 1.5 },
    { name: 'Matthew Studebaker', id: '1281990', hours: 1 },
    { name: 'Rachel', id: '1283065', hours: 1 },
    { name: 'Daniel Leon', id: '1286862', hours: 1 },
    { name: 'Morgan Bussius', id: '1288616', hours: 1 },
    { name: 'Ofelia Aguirre', id: '1288913', hours: 1 },
    { name: 'Savannah', id: '1281859', hours: 1 },
    { name: 'Taylor', id: '1289093', hours: 1 },
    { name: 'Vaughn', id: '1283995', hours: 2 },
    { name: 'Wade', id: '1280059', hours: 1.5 }
  ];

  // Validate crew IDs first
  const crewIds = orderWriters.map(w => w.id);
  const existingCrew = await prisma.crew.findMany({
    where: { id: { in: crewIds } },
    select: { id: true, name: true }
  });
  
  const existingCrewIds = new Set(existingCrew.map(c => c.id));
  const missingCrew = orderWriters.filter(w => !existingCrewIds.has(w.id));
  
  if (missingCrew.length > 0) {
    console.log('\n⚠️  The following crew members do not exist in the database:');
    missingCrew.forEach(w => console.log(`   - ${w.name} (${w.id})`));
    console.log('\n   Skipping non-existent crew members...\n');
  }

  for (const writer of orderWriters) {
    if (!existingCrewIds.has(writer.id)) {
      console.log(`⏭️  ${writer.name} - skipped (crew not found)`);
      continue;
    }

    try {
      // Create DailyRoleConstraint for each order writer
      await prisma.dailyRoleConstraint.upsert({
        where: {
          storeId_date_crewId_roleId: {
            storeId,
            date,
            crewId: writer.id,
            roleId: orderWriterRole.id
          }
        },
        update: {
          requiredHours: writer.hours
        },
        create: {
          storeId,
          date,
          crewId: writer.id,
          roleId: orderWriterRole.id,
          requiredHours: writer.hours
        }
      });
      console.log(`✅ ${writer.name} - ${writer.hours} hr(s)`);
    } catch (error: any) {
      console.log(`❌ Error adding ${writer.name}: ${error.message}`);
    }
  }

  console.log('\n✅ All constraints added successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
