import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CrewWithRoles = Awaited<ReturnType<typeof prisma.crew.findMany>>[number] & {
  crewRoles: Array<{ role: { code: string } | null }>;
};

async function main() {
  const storeId = Number(process.argv[2] ?? '768');
  const dateArg = process.argv[3] ?? '2025-11-25';

  const date = new Date(dateArg);
  date.setUTCHours(0, 0, 0, 0);

  console.log(`\n🔎 Feasibility snapshot for store ${storeId} on ${date.toISOString().split('T')[0]}\n`);

  const [shifts, hourlyConstraints, dailyConstraints, windowConstraints] = await Promise.all([
    prisma.shift.findMany({
      where: { storeId, date },
      orderBy: [{ startMin: 'asc' }],
    }),
    prisma.hourlyRoleConstraint.findMany({
      where: { storeId, date },
      include: { role: true },
      orderBy: [{ hour: 'asc' }, { roleId: 'asc' }],
    }),
    prisma.dailyRoleConstraint.findMany({
      where: { storeId, date },
      include: { crew: true, role: true },
      orderBy: [{ crewId: 'asc' }],
    }),
    prisma.windowRoleConstraint.findMany({
      where: { storeId, date },
      include: { role: true },
      orderBy: [{ roleId: 'asc' }],
    }),
  ]);

  console.log(`• Shifts: ${shifts.length}`);
  console.log(`• Hourly constraints: ${hourlyConstraints.length}`);
  console.log(`• Daily constraints: ${dailyConstraints.length}`);
  console.log(`• Window constraints: ${windowConstraints.length}`);

  const crewIds = shifts.map((shift) => shift.crewId);
  const crewWithRoles = crewIds.length
    ? await prisma.crew.findMany({
        where: { id: { in: crewIds } },
        include: {
          crewRoles: {
            include: { role: { select: { code: true } } },
          },
        },
      })
    : [];

  const crewEligibility = new Map<string, string[]>();
  crewWithRoles.forEach((crew) => {
    const roles = crew.crewRoles
      .map((cr) => cr.role?.code)
      .filter((code): code is string => Boolean(code));
    crewEligibility.set(crew.id, roles);
  });

  const byHour: Array<{
    hour: number;
    onShift: number;
    required: number;
    breakdown: Record<string, number>;
    roleCapacity: Record<string, number>;
  }> = [];

  for (let hour = 0; hour < 24; hour++) {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    const onShift = shifts.filter((shift) => shift.startMin < hourEnd && shift.endMin > hourStart).length;

    const matchingConstraints = hourlyConstraints.filter((c) => c.hour === hour);
    const breakdown: Record<string, number> = {};
    let required = 0;
    for (const constraint of matchingConstraints) {
      const roleCode = constraint.role?.code ?? `role#${constraint.roleId}`;
      breakdown[roleCode] = constraint.requiredPerHour;
      required += constraint.requiredPerHour;
    }

    const roleCapacity: Record<string, number> = {};
    byHour.push({ hour, onShift, required, breakdown, roleCapacity });
  }

  // Add coverage windows into hourly summary
  for (const window of windowConstraints) {
    for (let hour = window.startHour; hour < window.endHour; hour++) {
      if (hour < 0 || hour >= byHour.length) continue;
      const row = byHour[hour];
      const roleCode = window.role?.code ?? `role#${window.roleId}`;
      row.breakdown[roleCode] = (row.breakdown[roleCode] ?? 0) + window.requiredPerHour;
      row.required += window.requiredPerHour;
    }
  }

  // Compute per-role capacity (eligible crew on shift)
  for (const row of byHour) {
    const hourStart = row.hour * 60;
    const hourEnd = hourStart + 60;
    const activeCrew = shifts.filter((shift) => shift.startMin < hourEnd && shift.endMin > hourStart);
    for (const crew of activeCrew) {
      const roles = crewEligibility.get(crew.crewId) ?? [];
      for (const roleCode of roles) {
        row.roleCapacity[roleCode] = (row.roleCapacity[roleCode] ?? 0) + 1;
      }
    }
  }

  console.log('\n⏱️  Hourly coverage summary (on-shift vs required)');
  for (const row of byHour) {
    if (row.required === 0 && row.onShift === 0) continue;
    const status = row.required > row.onShift ? '⚠️ ' : '   ';
    const capacitySummary: Record<string, { req: number; cap: number }> = {};
    for (const [roleCode, req] of Object.entries(row.breakdown)) {
      capacitySummary[roleCode] = {
        req,
        cap: row.roleCapacity[roleCode] ?? 0,
      };
    }

    console.log(
      `${status}${String(row.hour).padStart(2, '0')}:00 — on shift: ${row.onShift.toString().padStart(2, ' ')} | required: ${row.required
        .toString()
        .padStart(2, ' ')} | per-role ${JSON.stringify(capacitySummary)}`
    );
  }

  const shiftByCrew = new Map(shifts.map((shift) => [shift.crewId, shift] as const));
  console.log('\n👤 Daily role requirements vs shift length');
  for (const req of dailyConstraints) {
    const shift = shiftByCrew.get(req.crewId);
    const shiftHours = shift ? (shift.endMin - shift.startMin) / 60 : 0;
    const status = req.requiredHours > shiftHours ? '⚠️ ' : '   ';
    const crewName = req.crew?.name ?? req.crewId;
    const roleName = req.role?.code ?? `role#${req.roleId}`;
    console.log(
      `${status}${crewName.padEnd(25)} needs ${req.requiredHours}h on ${roleName} (shift: ${shiftHours}h)`
    );
  }

  console.log('\n🪟 Window constraints');
  for (const window of windowConstraints) {
    const roleName = window.role?.code ?? `role#${window.roleId}`;
    console.log(
      `   ${roleName.padEnd(12)} ${String(window.startHour).padStart(2, '0')}:00-${String(window.endHour).padStart(2, '0')}:00 → ${window.requiredPerHour}/hr`
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Failed to analyze feasibility', error);
  prisma.$disconnect();
  process.exit(1);
});
