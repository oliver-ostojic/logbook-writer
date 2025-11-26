/**
 * Add test constraints for 2025-11-26
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testDate = new Date('2025-11-26');
  const storeId = 768;

  console.log('📋 Adding test constraints for', testDate.toISOString().split('T')[0]);

  // Get roles
  const registerRole = await prisma.role.findFirst({
    where: { storeId, code: 'REGISTER' },
  });
  
  const productRole = await prisma.role.findFirst({
    where: { storeId, code: 'PRODUCT' },
  });

  if (!registerRole || !productRole) {
    throw new Error('REGISTER or PRODUCT role not found');
  }

  console.log(`✅ Found roles: REGISTER (${registerRole.id}), PRODUCT (${productRole.id})`);

  // Add hourly constraints: 2 REGISTER staff during business hours (9am-6pm)
  console.log('\n📊 Adding hourly REGISTER constraints (9am-6pm, 2 per hour)...');
  let hourlyCount = 0;
  for (let hour = 9; hour < 18; hour++) {
    try {
      await prisma.hourlyRoleConstraint.create({
        data: {
          storeId,
          date: testDate,
          hour,
          roleId: registerRole.id,
          requiredPerHour: 2,
        },
      });
      hourlyCount++;
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`   Hour ${hour} already exists`);
      } else {
        throw error;
      }
    }
  }
  console.log(`✅ Created ${hourlyCount} hourly constraints`);

  // Add a window constraint: 1 PRODUCT staff between 10am-2pm
  console.log('\n📊 Adding window PRODUCT constraint (10am-2pm, 1 per hour)...');
  try {
    await prisma.windowRoleConstraint.create({
      data: {
        storeId,
        date: testDate,
        roleId: productRole.id,
        startHour: 10,
        endHour: 14,
        requiredPerHour: 1,
      },
    });
    console.log('✅ Created window constraint');
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log('⚠️  Window constraint already exists');
    } else {
      throw error;
    }
  }

  // Verify all constraints
  const hourlyConstraints = await prisma.hourlyRoleConstraint.findMany({
    where: { storeId, date: testDate },
    include: { role: true },
  });

  const windowConstraints = await prisma.windowRoleConstraint.findMany({
    where: { storeId, date: testDate },
    include: { role: true },
  });

  console.log('\n📊 Final constraint counts:');
  console.log(`   Hourly: ${hourlyConstraints.length}`);
  hourlyConstraints.slice(0, 3).forEach((c) => {
    console.log(`     - Hour ${c.hour}: ${c.requiredPerHour} × ${c.role.displayName}`);
  });
  if (hourlyConstraints.length > 3) {
    console.log(`     ... and ${hourlyConstraints.length - 3} more`);
  }

  console.log(`   Window: ${windowConstraints.length}`);
  windowConstraints.forEach((c) => {
    console.log(`     - ${c.startHour}:00-${c.endHour}:00: ${c.requiredPerHour} × ${c.role.displayName}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
