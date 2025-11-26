#!/usr/bin/env tsx
/**
 * Add default PARKING_HELM hourly requirements
 * 2 per hour (1 per 30-minute slot) during store hours
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  const date = new Date('2025-11-22');
  
  console.log('🅿️  Adding PARKING_HELM hourly requirements...\n');
  
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    console.error('❌ Store not found');
    process.exit(1);
  }
  
  const parkingHelmRole = await prisma.role.findUnique({
    where: { code: 'PARKING_HELM' },
  });
  
  if (!parkingHelmRole) {
    console.error('❌ PARKING_HELM role not found');
    process.exit(1);
  }
  
  // Store hours: 8am-9pm (480-1260 minutes)
  const openHour = Math.floor(store.openMinutesFromMidnight / 60);
  const closeHour = Math.floor(store.closeMinutesFromMidnight / 60);
  
  console.log(`Store hours: ${openHour}:00 - ${closeHour}:00`);
  console.log(`Creating requirements for PARKING_HELM: 2 per hour\n`);
  
  let created = 0;
  let updated = 0;
  
  for (let hour = openHour; hour < closeHour; hour++) {
    const existing = await prisma.hourlyRoleConstraint.findUnique({
      where: {
        storeId_date_hour_roleId: {
          storeId,
          date,
          hour,
          roleId: parkingHelmRole.id,
        },
      },
    });
    
    if (existing) {
      await prisma.hourlyRoleConstraint.update({
        where: { id: existing.id },
        data: { requiredPerHour: 2 },
      });
      console.log(`✅ Updated: Hour ${hour} - 2 crew`);
      updated++;
    } else {
      await prisma.hourlyRoleConstraint.create({
        data: {
          storeId,
          date,
          hour,
          roleId: parkingHelmRole.id,
          requiredPerHour: 2,
        },
      });
      console.log(`✅ Created: Hour ${hour} - 2 crew`);
      created++;
    }
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  
  const total = await prisma.hourlyRoleConstraint.count({
    where: {
      storeId,
      date,
      roleId: parkingHelmRole.id,
    },
  });
  console.log(`\n   Total PARKING_HELM hourly requirements: ${total}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
