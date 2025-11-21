import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const crew = await prisma.crewMember.findMany({
    include: {
      roles: {
        include: {
          role: true
        }
      }
    }
  });

  // Format output for Python test generator
  const output = crew.map(c => ({
    id: c.id,
    name: c.name,
    roles: c.roles.map(r => {
      const roleAssignment = r as any;
      return {
        role: r.role.name,
        info: roleAssignment.info || null,
        detail: (r.role as any).detail || null
      };
    })
  }));

  fs.writeFileSync('crew_roles_export.json', JSON.stringify(output, null, 2));
  console.log('Exported crew_roles_export.json');

  await prisma.$disconnect();
}

main();
