import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = Number(process.argv[2] ?? '768');
  const roles = await prisma.role.findMany({ where: { storeId } });
  roles.forEach((role) => {
    console.log(
      `${role.id.toString().padStart(4, ' ')} ${role.code.padEnd(15)} assignmentModel=${JSON.stringify(role.assignmentModel)} consecutive=${role.consecutivePolicy}`
    );
  });
}

main().finally(() => prisma.$disconnect());
