import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;

// Role Rule IDs for LIKE_ROLE_FOR_HOUR_X
const ROLE_RULES = {
  REG_FIRST_HOUR: 22,    // LIKE REG at hour 1 (0 min)
  REG_DISLIKE_HOUR_8: 23, // DISLIKE REG at hour 8 (480 min)
  PROD_FIRST_HOUR: 24,   // LIKE PROD at hour 1 (0 min)
  ART_FIRST_HOUR: 26,    // LIKE ART at hour 1 (0 min)
  SL_FIRST_HOUR: 28,     // LIKE SL at hour 1 (0 min)
};

// Value for first hour (60 min = 1 hr from shift start)
const FIRST_HOUR_VALUE = 60;
// Value for hour 8 (480 min = 8 hrs from shift start)
const HOUR_8_VALUE = 480;

// Specific crew for hour 8 preferences
const SPECIFIC_CREW = {
  REG_HOUR_8_LIKE: ['Shushan', 'Marcos'], // Like REG at hour 8
  REG_HOUR_8_DISLIKE: ['Di'],             // Dislike REG at hour 8
};

async function addHourPreferences() {
  console.log('Adding LIKE_ROLE_FOR_HOUR_X preferences to crew...\n');

  // Get all crew for the store with their roles
  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: { 
      CrewRole: { include: { Role: true } },
      CrewRoleRule: true 
    }
  });
  
  console.log(`Found ${allCrew.length} crew members in store ${STORE_ID}\n`);

  // Separate crew by roles
  const artCrew = allCrew.filter(c => c.CrewRole.some(cr => cr.Role.code === 'ART'));
  const slCrew = allCrew.filter(c => c.CrewRole.some(cr => cr.Role.code === 'SL'));
  const regularCrew = allCrew.filter(c => !artCrew.includes(c) && !slCrew.includes(c));

  console.log(`ART crew: ${artCrew.length}`);
  console.log(`SL crew: ${slCrew.length}`);
  console.log(`Regular crew: ${regularCrew.length}\n`);

  let totalAdded = 0;
  let totalSkipped = 0;

  // Helper to add a role rule to a crew member
  async function addRoleRule(crewId: string, crewName: string, roleRuleId: number, valueInt: number, description: string): Promise<boolean> {
    // Check if they already have this role rule with this value
    const existing = await prisma.crewRoleRule.findFirst({
      where: { crewId, roleRuleId, valueInt }
    });
    
    if (existing) {
      console.log(`  ⏭️  ${crewName} already has ${description}`);
      return false;
    }

    await prisma.crewRoleRule.create({
      data: {
        crewId,
        roleRuleId,
        valueInt,
      }
    });
    console.log(`  ✅ Added ${description} to ${crewName}`);
    return true;
  }

  // Shuffle array for random distribution
  function shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ============================================
  // REGULAR CREW: 75% get preference, 25% don't
  // Of the 75%: 22% REG first hour, 78% PROD first hour
  // ============================================
  console.log('=== Regular Crew First Hour Preferences ===');
  const shuffledRegular = shuffle(regularCrew);
  const regularWithPref = Math.floor(shuffledRegular.length * 0.75);
  const regularWithRegPref = Math.floor(regularWithPref * 0.22);
  
  for (let i = 0; i < shuffledRegular.length; i++) {
    const crew = shuffledRegular[i];
    if (i < regularWithRegPref) {
      // REG first hour (22% of 75%)
      if (await addRoleRule(crew.id, crew.name, ROLE_RULES.REG_FIRST_HOUR, FIRST_HOUR_VALUE, 'REG first hour')) {
        totalAdded++;
      } else {
        totalSkipped++;
      }
    } else if (i < regularWithPref) {
      // PROD first hour (78% of 75%)
      if (await addRoleRule(crew.id, crew.name, ROLE_RULES.PROD_FIRST_HOUR, FIRST_HOUR_VALUE, 'PROD first hour')) {
        totalAdded++;
      } else {
        totalSkipped++;
      }
    } else {
      // No preference (25%)
      console.log(`  ⭕ ${crew.name} - no first hour preference`);
    }
  }

  // ============================================
  // ART CREW: 100% want ART first hour
  // ============================================
  console.log('\n=== ART Crew First Hour Preferences ===');
  for (const crew of artCrew) {
    if (await addRoleRule(crew.id, crew.name, ROLE_RULES.ART_FIRST_HOUR, FIRST_HOUR_VALUE, 'ART first hour')) {
      totalAdded++;
    } else {
      totalSkipped++;
    }
  }

  // ============================================
  // SL CREW: 50% want SL first hour
  // ============================================
  console.log('\n=== SL Crew First Hour Preferences ===');
  const shuffledSL = shuffle(slCrew);
  const slWithPref = Math.floor(shuffledSL.length * 0.50);
  
  for (let i = 0; i < shuffledSL.length; i++) {
    const crew = shuffledSL[i];
    if (i < slWithPref) {
      if (await addRoleRule(crew.id, crew.name, ROLE_RULES.SL_FIRST_HOUR, FIRST_HOUR_VALUE, 'SL first hour')) {
        totalAdded++;
      } else {
        totalSkipped++;
      }
    } else {
      console.log(`  ⭕ ${crew.name} - no SL first hour preference`);
    }
  }

  // ============================================
  // SPECIFIC CREW: Hour 8 preferences
  // ============================================
  console.log('\n=== Specific Crew Hour 8 Preferences ===');
  
  // Shushan and Marcos: LIKE REG at hour 8
  for (const name of SPECIFIC_CREW.REG_HOUR_8_LIKE) {
    const crew = allCrew.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
    if (!crew) {
      console.log(`  ❌ Crew "${name}" not found`);
      continue;
    }
    if (await addRoleRule(crew.id, crew.name, ROLE_RULES.REG_FIRST_HOUR, HOUR_8_VALUE, 'REG at hour 8 (LIKE)')) {
      totalAdded++;
    } else {
      totalSkipped++;
    }
  }

  // Di: DISLIKE REG at hour 8
  for (const name of SPECIFIC_CREW.REG_HOUR_8_DISLIKE) {
    const crew = allCrew.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
    if (!crew) {
      console.log(`  ❌ Crew "${name}" not found`);
      continue;
    }
    if (await addRoleRule(crew.id, crew.name, ROLE_RULES.REG_DISLIKE_HOUR_8, HOUR_8_VALUE, 'REG at hour 8 (DISLIKE)')) {
      totalAdded++;
    } else {
      totalSkipped++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Total Added: ${totalAdded}, Skipped: ${totalSkipped}`);
  console.log(`========================================\n`);

  await prisma.$disconnect();
}

addHourPreferences().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
