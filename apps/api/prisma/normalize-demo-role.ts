import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function normalizeDemoRole() {
  // Find all roles named like 'demo' (any case)
  const roles = await prisma.role.findMany({
    where: { name: { equals: 'demo', mode: 'insensitive' } },
  });

  if (roles.length === 0) {
    console.log('No roles matching demo/DEMO found.');
    return;
  }

  // Select target role to keep
  let target = roles.find((r: { id: string; name: string }) => r.name === 'DEMO') ?? roles[0];
  if (target.name !== 'DEMO') {
    target = await prisma.role.update({ where: { id: target.id }, data: { name: 'DEMO' } });
  }

  const dupes = roles.filter((r: { id: string }) => r.id !== target.id);
  if (dupes.length === 0) {
    console.log('Only one DEMO-like role exists. Normalized name ensured.');
    return;
  }

  for (const dup of dupes) {
    console.log(`Merging role ${dup.id} (${dup.name}) into target ${target.id} (DEMO)`);
    await prisma.$transaction(async (tx: PrismaClient) => {
      // Reassign CrewMemberRole references carefully to avoid composite PK collisions
      const cRoles = await tx.crewMemberRole.findMany({ where: { roleId: dup.id } });
      for (const cr of cRoles) {
        const exists = await tx.crewMemberRole.findUnique({
          where: { crewMemberId_roleId: { crewMemberId: cr.crewMemberId, roleId: target.id } },
        });
        if (exists) {
          await tx.crewMemberRole.delete({ where: { crewMemberId_roleId: { crewMemberId: cr.crewMemberId, roleId: dup.id } } });
        } else {
          await tx.crewMemberRole.update({
            where: { crewMemberId_roleId: { crewMemberId: cr.crewMemberId, roleId: dup.id } },
            data: { roleId: target.id },
          });
        }
      }

      // Reassign DailyRoleRequirement references, merging duplicates by summing requiredHours
      const reqs = await tx.dailyRoleRequirement.findMany({ where: { roleId: dup.id } });
      for (const r of reqs) {
        const existing = await tx.dailyRoleRequirement.findUnique({
          where: { date_storeId_crewId_roleId: { date: r.date, storeId: r.storeId, crewId: r.crewId, roleId: target.id } },
        });
        if (existing) {
          await tx.dailyRoleRequirement.update({
            where: { id: existing.id },
            data: { requiredHours: existing.requiredHours + r.requiredHours },
          });
          await tx.dailyRoleRequirement.delete({ where: { id: r.id } });
        } else {
          await tx.dailyRoleRequirement.update({ where: { id: r.id }, data: { roleId: target.id } });
        }
      }

      // Merge DailyRoleCoverage rows to target, handle unique conflicts via upsert
      const covs = await tx.dailyRoleCoverage.findMany({ where: { roleId: dup.id } });
      for (const c of covs) {
        await tx.dailyRoleCoverage.upsert({
          where: { date_storeId_roleId: { date: c.date, storeId: c.storeId, roleId: target.id } },
          update: {}, // keep existing target coverage if any
          create: {
            id: randomUUID(),
            date: c.date,
            storeId: c.storeId,
            roleId: target.id,
            windowStart: c.windowStart,
            windowEnd: c.windowEnd,
            requiredPerHour: c.requiredPerHour,
            createdBy: c.createdBy,
          },
        });
        // Try to delete the duplicate coverage row (ignore if already removed by cascading)
        await tx.dailyRoleCoverage.delete({ where: { id: c.id } }).catch(() => {});
      }

      // Finally, delete the duplicate Role row
      await tx.role.delete({ where: { id: dup.id } }).catch(() => {});
    });
  }

  console.log('Normalization complete.');
}

normalizeDemoRole()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
