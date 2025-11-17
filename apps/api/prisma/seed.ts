import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // 1 store
  const store = await prisma.store.upsert({
    where: { id: 768 },
    update: {},
    create: {
      id: 768,
      minRegisterHours: 2,
      maxRegisterHours: 7,
      name: 'Demo Store'
    },
  });

  // 2 roles
  const Demo = await prisma.role.upsert({
    where: { name: 'DEMO' },
    update: {},
    create: {
      id: randomUUID(),
      name: 'DEMO',
    },
  });

  const OrderWriter = await prisma.role.upsert({
    where: { name: 'OrderWriter' },
    update: {},
    create: {
      id: randomUUID(),
      name: 'OrderWriter',
    },
  });

  // 2 crew
  await prisma.crewMember.upsert({
    where: { id: '1280713' },
    update: {},
    create: {
      id: '1280713',
      name: 'Abigail Perez',
      blockSize: 60,
      storeId: store.id,
      roles: {
        create: [
          { roleId: OrderWriter.id }
        ],
      },
  // taskPreference: 'REGISTER', // optional
    },
  });

  await prisma.crewMember.upsert({
    where: { id: '1269090' },
    update: {},
    create: {
      id: '1269090',
      name: 'Oliver Ostojic',
      blockSize: 60,
      storeId: store.id,
      roles: {
        create: [
          { roleId: Demo.id },
        ],
      },
  // taskPreference: 'PRODUCT', // optional
    },
  });

  // 2 hour rules for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.storeHourRule.upsert({
    where: { storeId_date_hour: { storeId: store.id, date: today, hour: 9 } },
    update: {},
    create: {
      id: randomUUID(),
      storeId: store.id,
      date: today,
      hour: 9,
      requiredRegisters: 2,
      minParking: 1,
    },
  });

  await prisma.storeHourRule.upsert({
    where: { storeId_date_hour: { storeId: store.id, date: today, hour: 10 } },
    update: {},
    create: {
      id: randomUUID(),
      storeId: store.id,
      date: today,
      hour: 10,
      requiredRegisters: 3,
      minParking: 1,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
