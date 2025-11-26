import { PrismaClient, PreferenceType } from '@prisma/client';

const prisma = new PrismaClient();
const STORE_ID = 768;
const SEED = 42; // Deterministic seed for consistent distributions

// Target distributions (percentages enabled)
const DISTRIBUTIONS = {
  FIRST_HOUR: {
    REGISTER: 0.35,   // 35% enabled
    PRODUCT: 0.65,    // 65% enabled
    ART: 0.70,        // 70% enabled (only for ART crew)
  },
  FAVORITE: {
    PRODUCT: 0.75,    // 75% enabled
    REGISTER: 0.25,   // 25% enabled
  },
  TIMING: {
    BREAK: { early: 0.10, late: 0.90 },           // 10% early (-1), 90% late (1)
    PARKING_HELMS: { early: 0.15, late: 0.85 },   // 15% early (-1), 85% late (1)
  },
  CONSECUTIVE: {
    PRODUCT: 0.65,    // 65% enabled
    REGISTER: 0.15,   // 15% enabled
  },
};

// Seeded random shuffle for deterministic distribution
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let currentSeed = seed;
  const random = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  console.log(`Seeding CrewPreference with distributions for store ${STORE_ID}...`);
  console.log(`Using seed: ${SEED} for deterministic assignment\n`);

  // Fetch role preferences with role details
  const rolePreferences = await prisma.rolePreference.findMany({
    where: { storeId: STORE_ID },
    include: { role: { select: { code: true } } },
  });
  if (rolePreferences.length === 0) {
    throw new Error('No RolePreference rows found; seed-role-preferences must be run first.');
  }
  console.log(`Found ${rolePreferences.length} role preference templates.`);

  // Fetch all crew
  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    select: { id: true, name: true },
  });
  console.log(`Found ${allCrew.length} crew.\n`);

  // Fetch ART crew (for ART FIRST_HOUR restriction)
  const artCrew = await prisma.crewRole.findMany({
    where: {
      crew: { storeId: STORE_ID },
      role: { code: 'ART' },
    },
    select: { crewId: true },
  });
  const artCrewIds = new Set(artCrew.map(cr => cr.crewId));
  console.log(`Found ${artCrewIds.size} crew with ART role.\n`);

  let created = 0;
  let updated = 0;
  const stats: Record<string, { enabled: number; disabled: number; early?: number; late?: number }> = {};

  for (const rp of rolePreferences) {
    const roleCode = rp.role?.code || 'UNKNOWN';
    const prefType = rp.preferenceType;
    const key = `${roleCode}_${prefType}`;
    
    stats[key] = { enabled: 0, disabled: 0 };

    // Determine eligible crew for this preference
    let eligibleCrew = allCrew;
    if (prefType === PreferenceType.FIRST_HOUR && roleCode === 'ART') {
      // ART FIRST_HOUR: only for crew with ART role
      eligibleCrew = allCrew.filter(c => artCrewIds.has(c.id));
      console.log(`${key}: ${eligibleCrew.length} eligible crew (ART-only restriction)`);
    }

    // Shuffle for random distribution
    const shuffled = seededShuffle(eligibleCrew, SEED + rp.id);

    for (let i = 0; i < shuffled.length; i++) {
      const crew = shuffled[i];
      let enabled = true;
      let intValue: number | null = null;

      // Determine enabled status and intValue based on preference type
      if (prefType === PreferenceType.FIRST_HOUR) {
        const threshold = DISTRIBUTIONS.FIRST_HOUR[roleCode as keyof typeof DISTRIBUTIONS.FIRST_HOUR] || 0.5;
        enabled = i < shuffled.length * threshold;
      } else if (prefType === PreferenceType.FAVORITE) {
        const threshold = DISTRIBUTIONS.FAVORITE[roleCode as keyof typeof DISTRIBUTIONS.FAVORITE] || 0.5;
        enabled = i < shuffled.length * threshold;
      } else if (prefType === PreferenceType.TIMING) {
        const timingDist = DISTRIBUTIONS.TIMING[roleCode as keyof typeof DISTRIBUTIONS.TIMING];
        if (timingDist) {
          const earlyCount = Math.floor(shuffled.length * timingDist.early);
          if (i < earlyCount) {
            intValue = -1; // Early
            stats[key].early = (stats[key].early || 0) + 1;
          } else {
            intValue = 1; // Late
            stats[key].late = (stats[key].late || 0) + 1;
          }
          enabled = true; // All TIMING prefs are enabled, just vary intValue
        }
      } else if (prefType === PreferenceType.CONSECUTIVE) {
        const threshold = DISTRIBUTIONS.CONSECUTIVE[roleCode as keyof typeof DISTRIBUTIONS.CONSECUTIVE] || 0.5;
        enabled = i < shuffled.length * threshold;
      }

      // Track stats
      if (enabled) stats[key].enabled++;
      else stats[key].disabled++;

      // Upsert CrewPreference
      const existing = await prisma.crewPreference.findFirst({
        where: { crewId: crew.id, rolePreferenceId: rp.id },
        select: { id: true },
      });

      if (existing) {
        await prisma.crewPreference.update({
          where: { id: existing.id },
          data: { enabled, crewWeight: 1, intValue },
        });
        updated++;
      } else {
        await prisma.crewPreference.create({
          data: {
            crewId: crew.id,
            rolePreferenceId: rp.id,
            enabled,
            crewWeight: 1,
            intValue,
          },
        });
        created++;
      }
    }
  }

  console.log(`\nCreated: ${created}, Updated: ${updated}`);
  console.log(`\nDistribution Results:`);
  Object.entries(stats).forEach(([key, stat]) => {
    const total = stat.enabled + stat.disabled;
    const enabledPct = total > 0 ? ((stat.enabled / total) * 100).toFixed(1) : '0.0';
    if (stat.early !== undefined && stat.late !== undefined) {
      const earlyPct = total > 0 ? ((stat.early / total) * 100).toFixed(1) : '0.0';
      const latePct = total > 0 ? ((stat.late / total) * 100).toFixed(1) : '0.0';
      console.log(`  ${key}: Early=${stat.early} (${earlyPct}%), Late=${stat.late} (${latePct}%)`);
    } else {
      console.log(`  ${key}: Enabled=${stat.enabled} (${enabledPct}%), Disabled=${stat.disabled}`);
    }
  });
}

main().catch(e => {
  console.error('Error seeding crew preferences:', e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
