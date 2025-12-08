import { PrismaClient } from '@prisma/client';
import {
  calculateAllSatisfaction,
  savePreferenceSatisfaction,
  saveLogPreferenceMetadata,
  type AssignmentRecord,
  type PreferenceRecord,
  type CrewShiftWindow,
  type RoleTimingWindow,
  type TimingPreferenceContext,
} from './src/services/preference-satisfaction';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  const testDate = new Date('2025-11-25');

  console.log('\n🔍 Testing Preference Satisfaction Calculation\n');
  console.log(`Store: ${storeId}`);
  console.log(`Date: ${testDate.toISOString().split('T')[0]}\n`);

  const roles = await prisma.role.findMany({ where: { storeId } });

  const roleWindowMap: Map<number, RoleTimingWindow> = new Map();
  roles.forEach(role => {
    roleWindowMap.set(role.id, {
      startOffsetMin: (role as any).windowStartOffsetMin ?? undefined,
      endOffsetMin: (role as any).windowEndOffsetMin ?? undefined,
    });
  });
  console.log(`Loaded ${roleWindowMap.size} role window configs\n`);

  // For this test, we'll create mock assignments based on common scenarios
  // In real usage, you'd fetch from Assignment table or solver output
  const mockAssignments: AssignmentRecord[] = [
    // Crew A - should satisfy FIRST_HOUR at 8am and FAVORITE for REGISTER
    { crewId: '1234567', roleId: 1, startMinutes: 480, endMinutes: 510 },   // 8:00-8:30 REGISTER
    { crewId: '1234567', roleId: 1, startMinutes: 510, endMinutes: 540 },   // 8:30-9:00 REGISTER
    { crewId: '1234567', roleId: 2, startMinutes: 540, endMinutes: 570 },   // 9:00-9:30 PRODUCT
    { crewId: '1234567', roleId: 3, startMinutes: 570, endMinutes: 600 },   // 9:30-10:00 BREAK
    { crewId: '1234567', roleId: 1, startMinutes: 600, endMinutes: 630 },   // 10:00-10:30 REGISTER
    { crewId: '1234567', roleId: 1, startMinutes: 630, endMinutes: 660 },   // 10:30-11:00 REGISTER

    // Crew B - testing CONSECUTIVE preference
    { crewId: '2345678', roleId: 2, startMinutes: 600, endMinutes: 630 },   // 10:00-10:30 PRODUCT
    { crewId: '2345678', roleId: 2, startMinutes: 630, endMinutes: 660 },   // 10:30-11:00 PRODUCT
    { crewId: '2345678', roleId: 2, startMinutes: 660, endMinutes: 690 },   // 11:00-11:30 PRODUCT
    { crewId: '2345678', roleId: 1, startMinutes: 690, endMinutes: 720 },   // 11:30-12:00 REGISTER (switch)
    { crewId: '2345678', roleId: 2, startMinutes: 720, endMinutes: 750 },   // 12:00-12:30 PRODUCT (switch)
    { crewId: '2345678', roleId: 2, startMinutes: 750, endMinutes: 780 },   // 12:30-1:00 PRODUCT
  ];

  // Fetch RolePreferences with CrewPreferences for the test crews
  const rolePreferences = await prisma.rolePreference.findMany({
    where: { storeId },
    include: {
      crewPreferences: {
        where: {
          enabled: true,
          crewId: { in: mockAssignments.map(a => a.crewId) }
        }
      }
    }
  });

  // Build PreferenceRecord array from RolePreference + CrewPreference joins
  const preferences: PreferenceRecord[] = [];
  
  for (const rp of rolePreferences) {
    for (const cp of rp.crewPreferences) {
      preferences.push({
        id: rp.id,
        crewId: cp.crewId,
        roleId: rp.roleId,
        preferenceType: rp.preferenceType,
        baseWeight: rp.baseWeight,
        crewWeight: cp.crewWeight,
        intValue: cp.intValue,
      });
    }
  }

  console.log(`Found ${preferences.length} active preferences\n`);

  if (preferences.length === 0) {
    console.log('⚠️  No preferences found for test crews. Creating sample preferences...\n');
    
    // Create sample preferences for testing
    const samplePreferences: PreferenceRecord[] = [
      {
        id: 1,
        crewId: '1234567',
        roleId: null,
        preferenceType: 'FIRST_HOUR',
        baseWeight: 5,
        crewWeight: 1,
        intValue: 8, // Prefer starting at 8am
      },
      {
        id: 2,
        crewId: '1234567',
        roleId: 1, // REGISTER
        preferenceType: 'FAVORITE',
        baseWeight: 5,
        crewWeight: 1,
        intValue: null,
      },
      {
        id: 3,
        crewId: '1234567',
        roleId: null,
        preferenceType: 'TIMING',
        baseWeight: 3,
        crewWeight: 1,
        intValue: -1, // Prefer early breaks
      },
      {
        id: 4,
        crewId: '2345678',
        roleId: 2, // PRODUCT
        preferenceType: 'CONSECUTIVE',
        baseWeight: 4,
        crewWeight: 1,
        intValue: null,
      },
    ];

    // Calculate satisfaction
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('CALCULATING SATISFACTION\n');
    
    const timingContext: TimingPreferenceContext = {
      crewShifts: buildCrewShiftMap(mockAssignments),
      roleWindows: roleWindowMap,
    };

    const results = await calculateAllSatisfaction(
      mockAssignments,
      samplePreferences,
      timingContext
    );

    // Display results
    console.log('RESULTS:\n');
    for (const result of results) {
      const pref = samplePreferences.find(p => p.id === result.rolePreferenceId)!;
      console.log(`Crew ${result.crewId} - ${pref.preferenceType}:`);
      console.log(`  Satisfaction: ${(result.satisfaction * 100).toFixed(1)}%`);
      console.log(`  Met: ${result.met ? 'YES' : 'NO'}`);
      console.log(`  Weight: ${result.weightApplied}`);
      if (result.details) {
        console.log(`  Details: ${result.details}`);
      }
      console.log();
    }

    // Summary
    const metCount = results.filter(r => r.met).length;
    const avgSatisfaction = results.reduce((sum, r) => sum + r.satisfaction, 0) / results.length;
    const weightedAvg = results.reduce((sum, r) => sum + (r.satisfaction * r.weightApplied), 0) / 
                        results.reduce((sum, r) => sum + r.weightApplied, 0);

    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('SUMMARY:\n');
    console.log(`Total Preferences: ${results.length}`);
    console.log(`Preferences Met (>50%): ${metCount} (${(metCount/results.length*100).toFixed(1)}%)`);
    console.log(`Average Satisfaction: ${(avgSatisfaction * 100).toFixed(1)}%`);
    console.log(`Weighted Average: ${(weightedAvg * 100).toFixed(1)}%\n`);

    console.log('✅ Test complete!\n');
    console.log('💡 This demonstrates how each preference type is measured:');
    console.log('   • FIRST_HOUR: Binary (did first assignment start at preferred hour?)');
    console.log('   • FAVORITE: Binary (did preferred role get the most hours?)');
    console.log('   • TIMING: 0-1 range (where was break in the allowed window?)');
    console.log('   • CONSECUTIVE: 0-1 range (how many role switches vs worst case?)\n');
  } else {
    // Calculate with real preferences
    const timingContext: TimingPreferenceContext = {
      crewShifts: buildCrewShiftMap(mockAssignments),
      roleWindows: roleWindowMap,
    };

    const results = await calculateAllSatisfaction(
      mockAssignments,
      preferences,
      timingContext
    );

    console.log(`Calculated satisfaction for ${results.length} preferences\n`);
    
    // Group by type
    const byType = new Map<string, typeof results>();
    for (const result of results) {
      const pref = preferences.find(p => p.id === result.rolePreferenceId)!;
      if (!byType.has(pref.preferenceType)) {
        byType.set(pref.preferenceType, []);
      }
      byType.get(pref.preferenceType)!.push(result);
    }

    for (const [type, typeResults] of byType) {
      console.log(`\n${type}:`);
      console.log(`  Total: ${typeResults.length}`);
      console.log(`  Met: ${typeResults.filter(r => r.met).length}`);
      const avgSat = typeResults.reduce((sum, r) => sum + r.satisfaction, 0) / typeResults.length;
      console.log(`  Avg Satisfaction: ${(avgSat * 100).toFixed(1)}%`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

function buildCrewShiftMap(assignments: AssignmentRecord[]): Map<string, CrewShiftWindow> {
  const map = new Map<string, CrewShiftWindow>();
  for (const assignment of assignments) {
    const existing = map.get(assignment.crewId);
    if (!existing) {
      map.set(assignment.crewId, {
        shiftStartMin: assignment.startMinutes,
        shiftEndMin: assignment.endMinutes,
      });
    } else {
      existing.shiftStartMin = Math.min(existing.shiftStartMin, assignment.startMinutes);
      existing.shiftEndMin = Math.max(existing.shiftEndMin, assignment.endMinutes);
    }
  }
  return map;
}
