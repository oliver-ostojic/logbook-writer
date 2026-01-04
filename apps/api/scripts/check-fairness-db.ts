import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check counts first
  const count1 = await prisma.crewRoleFairnessHistory.count({ where: { storeId: 768 } });
  console.log('CrewRoleFairnessHistory count:', count1);
  
  const count2 = await prisma.roleFairnessSnapshot.count({ where: { storeId: 768 } });
  console.log('RoleFairnessSnapshot count:', count2);
  
  // Clear all fairness data for store 768
  const deleted1 = await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: 768 } });
  console.log('Deleted CrewRoleFairnessHistory:', deleted1.count);
  
  const deleted2 = await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: 768 } });
  console.log('Deleted RoleFairnessSnapshot:', deleted2.count);
  
  // Delete synthetic dates (Jan and June 2025)
  const syntheticDates: Date[] = [];
  for (let day = 1; day <= 31; day++) {
    syntheticDates.push(new Date(`2025-01-${day.toString().padStart(2, '0')}`));
  }
  for (let day = 1; day <= 30; day++) {
    syntheticDates.push(new Date(`2025-06-${day.toString().padStart(2, '0')}`));
  }
  
  // Find logbooks first
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId: 768,
      date: { in: syntheticDates }
    },
    select: { id: true }
  });
  const logbookIds = logbooks.map(l => l.id);
  console.log('Found', logbookIds.length, 'synthetic logbooks');
  
  if (logbookIds.length > 0) {
    await prisma.assignment.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.run.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logbook.deleteMany({ where: { id: { in: logbookIds } } });
    console.log('Deleted synthetic logbooks and related records');
  }
  
  // Delete synthetic shifts
  const deletedShifts = await prisma.shift.deleteMany({
    where: {
      storeId: 768,
      date: { in: syntheticDates }
    }
  });
  console.log('Deleted synthetic shifts:', deletedShifts.count);
  
  // Delete synthetic coverage windows
  const deletedCW = await prisma.roleCoverageWindow.deleteMany({
    where: {
      storeId: 768,
      date: { in: syntheticDates }
    }
  });
  console.log('Deleted synthetic coverage windows:', deletedCW.count);
  
  // Delete synthetic quotas
  const deletedQuotas = await prisma.crewRoleQuota.deleteMany({
    where: {
      storeId: 768,
      date: { in: syntheticDates }
    }
  });
  console.log('Deleted synthetic quotas:', deletedQuotas.count);
  
  // Verify
  const remaining = await prisma.crewRoleFairnessHistory.count({ where: { storeId: 768 } });
  console.log('Remaining CrewRoleFairnessHistory:', remaining);
  
  await prisma.$disconnect();
}
main();
