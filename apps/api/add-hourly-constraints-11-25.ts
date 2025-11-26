import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  const date = new Date('2025-11-25');

  // Resolve role IDs by code
  const roles = await prisma.role.findMany({ where: { storeId } });
  const roleIdByCode = new Map(roles.map(r => [r.code, r.id]));

  const registerRoleId = roleIdByCode.get('REGISTER');
  const parkingRoleId = roleIdByCode.get('PARKING_HELM');

  if (!registerRoleId || !parkingRoleId) {
    throw new Error('Missing REGISTER or PARKING_HELM role in DB for store 768');
  }

  // Store metadata
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error('Store not found');
  const open = store.openMinutesFromMidnight ?? 480; // 8:00
  const close = store.closeMinutesFromMidnight ?? 1260; // 21:00

  // Build hours array from open to close (inclusive start, exclusive end)
  const startHour = Math.floor(open / 60);
  const endHour = Math.floor(close / 60); // 21

  // REGISTER required per hour map (user-provided for 11/25)
  const registerByHour: Record<number, number> = {
    8: 10,
    9: 8,
    10: 12,
    11: 11,
    12: 7,
    13: 11,  // 1pm
    14: 12,  // 2pm
    15: 13,  // 3pm
    16: 13,  // 4pm
    17: 13,  // 5pm
    18: 12,  // 6pm
    19: 12,   // 7pm
    20: 7    // 8pm
  };

  // Default to 7 if hour not specified
  function regReq(h: number) { return registerByHour[h] ?? 7; }

  let created = 0;

  // Clear existing hourly constraints for this date to avoid duplicates
  await prisma.hourlyRoleConstraint.deleteMany({ where: { storeId, date } });

  for (let h = startHour; h <= endHour; h++) {
    const reqRegister = regReq(h);
    // PARKING_HELM: 2 per hour from 9am-8pm (skip 8am)
    const reqParking = (h >= 9 && h <= 20) ? 2 : 0;

    // Create REGISTER constraint for this hour
    await prisma.hourlyRoleConstraint.create({
      data: {
        storeId,
        date,
        hour: h,
        roleId: registerRoleId,
        requiredPerHour: reqRegister,
      }
    });
    created++;

    // Create PARKING_HELM constraint for this hour (if required)
    if (reqParking > 0) {
      await prisma.hourlyRoleConstraint.create({
        data: {
          storeId,
          date,
          hour: h,
          roleId: parkingRoleId,
          requiredPerHour: reqParking,
        }
      });
      created++;
    }
  }

  console.log(`\n✅ Created ${created} hourly role constraints for ${date.toISOString().split('T')[0]}`);
  console.log(`   REGISTER: varying by hour (8am-8pm)`);
  console.log(`   PARKING_HELM: 2/hour (9am-8pm)\n`);
}

main().catch(err => { console.error(err); }).finally(() => prisma.$disconnect());
