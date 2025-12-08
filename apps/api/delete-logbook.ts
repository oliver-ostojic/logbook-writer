import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteLogbook() {
  const logbook = await prisma.logbook.findFirst({ where: { storeId: 768 } });
  
  if (!logbook) {
    console.log("No logbook found");
    return;
  }
  
  console.log("Found logbook:", logbook.id);
  
  const deleted1 = await prisma.assignment.deleteMany({ where: { logbookId: logbook.id } });
  console.log("Deleted assignments:", deleted1.count);
  
  const deleted2 = await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: logbook.id } });
  console.log("Deleted preferenceSatisfaction:", deleted2.count);
  
  const deleted3 = await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: logbook.id } });
  console.log("Deleted logPreferenceMetadata:", deleted3.count);
  
  await prisma.logbook.delete({ where: { id: logbook.id } });
  console.log("Deleted logbook!");
  
  await prisma.$disconnect();
}

deleteLogbook();
