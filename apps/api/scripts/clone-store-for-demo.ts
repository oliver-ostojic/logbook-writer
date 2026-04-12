/**
 * Clone store 768 (Dr. Phillips) into a new "Winter Park" demo store.
 * Creates all related data with remapped IDs and a demo CAPTAIN user.
 *
 * Run with: npx tsx scripts/clone-store-for-demo.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const SOURCE_STORE_ID = 768;
const NEW_STORE_ID = 770;
const NEW_STORE_NAME = 'Winter Park';
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo123';

async function deleteStoreData(storeId: number) {
  // Delete in reverse dependency order
  const crewIds = (await prisma.crew.findMany({ where: { storeId }, select: { id: true } })).map(c => c.id);
  const roleIds = (await prisma.role.findMany({ where: { storeId }, select: { id: true } })).map(r => r.id);
  const logbookIds = (await prisma.logbook.findMany({ where: { storeId }, select: { id: true } })).map(l => l.id);
  const roleRuleIds = (await prisma.roleRule.findMany({ where: { roleId: { in: roleIds } }, select: { id: true } })).map(r => r.id);

  await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: { in: logbookIds } } });
  await prisma.assignment.deleteMany({ where: { logbookId: { in: logbookIds } } });
  await prisma.run.deleteMany({ where: { storeId } });
  await prisma.logbook.deleteMany({ where: { storeId } });
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId } });
  await prisma.roleFairnessTracker.deleteMany({ where: { storeId } });
  await prisma.crewRoleQuota.deleteMany({ where: { storeId } });
  await prisma.roleCoverageWindow.deleteMany({ where: { storeId } });
  await prisma.shift.deleteMany({ where: { storeId } });
  await prisma.activityLog.deleteMany({ where: { storeId } });
  await prisma.inviteCode.deleteMany({ where: { storeId } });
  await prisma.user.deleteMany({ where: { storeId, username: DEMO_USERNAME } });
  await prisma.crewRoleRule.deleteMany({ where: { crewId: { in: crewIds } } });
  await prisma.storeRoleRule.deleteMany({ where: { storeId } });
  await prisma.storeDefaultRole.deleteMany({ where: { storeId } });
  await prisma.roleRule.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.crewRole.deleteMany({ where: { crewId: { in: crewIds } } });
  await prisma.crew.deleteMany({ where: { storeId } });
  await prisma.role.deleteMany({ where: { storeId } });
  await prisma.store.delete({ where: { id: storeId } });
}

async function main() {
  const forceFlag = process.argv.includes('--force');

  // Check if target store already exists
  const existing = await prisma.store.findUnique({ where: { id: NEW_STORE_ID } });
  if (existing && !forceFlag) {
    console.log(`Store ${NEW_STORE_ID} already exists. Use --force to delete and re-clone.`);
    process.exit(1);
  }
  if (existing) {
    console.log(`Deleting existing store ${NEW_STORE_ID}...`);
    await deleteStoreData(NEW_STORE_ID);
    console.log('✓ Old store deleted\n');
  }

  // Fetch source store
  const sourceStore = await prisma.store.findUnique({ where: { id: SOURCE_STORE_ID } });
  if (!sourceStore) {
    console.error(`Source store ${SOURCE_STORE_ID} not found.`);
    process.exit(1);
  }

  console.log(`Cloning "${sourceStore.name}" (${SOURCE_STORE_ID}) → "${NEW_STORE_NAME}" (${NEW_STORE_ID})...\n`);

  // ── 1. Create new store ──
  await prisma.store.create({
    data: {
      id: NEW_STORE_ID,
      name: NEW_STORE_NAME,
      timezone: sourceStore.timezone,
      openMinutesFromMidnight: sourceStore.openMinutesFromMidnight,
      closeMinutesFromMidnight: sourceStore.closeMinutesFromMidnight,
      companyId: sourceStore.companyId,
    },
  });
  console.log('✓ Store created');

  // ── 2. Clone Crew ──
  // Crew IDs are 7-char strings. We remap by changing the prefix.
  const sourceCrew = await prisma.crew.findMany({ where: { storeId: SOURCE_STORE_ID } });
  const crewIdMap = new Map<string, string>();

  for (const c of sourceCrew) {
    // Generate new crew ID: replace first char with 'W' for Winter Park
    const newId = 'W' + c.id.slice(1);
    crewIdMap.set(c.id, newId);
  }

  for (const c of sourceCrew) {
    const newId = crewIdMap.get(c.id)!;
    await prisma.crew.create({
      data: {
        id: newId,
        name: c.name,
        storeId: NEW_STORE_ID,
      },
    });
  }
  console.log(`✓ ${sourceCrew.length} crew cloned`);

  // ── 3. Clone Roles ──
  const sourceRoles = await prisma.role.findMany({ where: { storeId: SOURCE_STORE_ID } });
  const roleIdMap = new Map<number, number>();

  for (const r of sourceRoles) {
    const newRole = await prisma.role.create({
      data: {
        storeId: NEW_STORE_ID,
        code: `${r.code}_WP`,
        displayName: r.displayName,
        allowOutsideStoreHours: r.allowOutsideStoreHours,
        consecutivePolicy: r.consecutivePolicy,
        windowStartOffsetMin: r.windowStartOffsetMin,
        windowEndOffsetMin: r.windowEndOffsetMin,
        minShiftLengthForRoleAccess: r.minShiftLengthForRoleAccess,
        taskLength: r.taskLength,
        familyId: r.familyId,
        assignmentModel: r.assignmentModel,
        canSplitForGaps: r.canSplitForGaps,
        codePDF: r.codePDF,
      },
    });
    roleIdMap.set(r.id, newRole.id);
  }
  console.log(`✓ ${sourceRoles.length} roles cloned`);

  // ── 4. Clone CrewRoles ──
  const sourceCrewRoles = await prisma.crewRole.findMany({
    where: { crewId: { in: Array.from(crewIdMap.keys()) } },
  });

  for (const cr of sourceCrewRoles) {
    const newCrewId = crewIdMap.get(cr.crewId);
    const newRoleId = roleIdMap.get(cr.roleId);
    if (!newCrewId || !newRoleId) continue;

    await prisma.crewRole.create({
      data: {
        crewId: newCrewId,
        roleId: newRoleId,
        crewName: cr.crewName,
        roleName: cr.roleName,
        specialization: cr.specialization,
      },
    });
  }
  console.log(`✓ ${sourceCrewRoles.length} crew-role assignments cloned`);

  // ── 5. Clone RoleRules ──
  const sourceRoleRules = await prisma.roleRule.findMany({
    where: { roleId: { in: Array.from(roleIdMap.keys()) } },
  });
  const roleRuleIdMap = new Map<number, number>();

  for (const rr of sourceRoleRules) {
    const newRoleId = roleIdMap.get(rr.roleId)!;
    const newTargetRoleId = rr.targetRoleId ? roleIdMap.get(rr.targetRoleId) ?? null : null;

    const newRR = await prisma.roleRule.create({
      data: {
        roleId: newRoleId,
        type: rr.type,
        targetRoleId: newTargetRoleId,
        constraintType: rr.constraintType,
        description: rr.description,
      },
    });
    roleRuleIdMap.set(rr.id, newRR.id);
  }
  console.log(`✓ ${sourceRoleRules.length} role rules cloned`);

  // ── 6. Clone StoreRoleRules ──
  const sourceStoreRoleRules = await prisma.storeRoleRule.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const srr of sourceStoreRoleRules) {
    const newRoleRuleId = roleRuleIdMap.get(srr.roleRuleId);
    if (!newRoleRuleId) continue;

    await prisma.storeRoleRule.create({
      data: {
        storeId: NEW_STORE_ID,
        roleRuleId: newRoleRuleId,
        isPriority: srr.isPriority,
        valueInt: srr.valueInt,
      },
    });
  }
  console.log(`✓ ${sourceStoreRoleRules.length} store role rules cloned`);

  // ── 7. Clone CrewRoleRules ──
  const sourceCrewRoleRules = await prisma.crewRoleRule.findMany({
    where: { crewId: { in: Array.from(crewIdMap.keys()) } },
  });

  for (const crr of sourceCrewRoleRules) {
    const newCrewId = crewIdMap.get(crr.crewId);
    const newRoleRuleId = roleRuleIdMap.get(crr.roleRuleId);
    if (!newCrewId || !newRoleRuleId) continue;

    await prisma.crewRoleRule.create({
      data: {
        crewId: newCrewId,
        roleRuleId: newRoleRuleId,
        isPriority: crr.isPriority,
        valueInt: crr.valueInt,
      },
    });
  }
  console.log(`✓ ${sourceCrewRoleRules.length} crew role rules cloned`);

  // ── 8. Clone StoreDefaultRoles ──
  const sourceDefaultRoles = await prisma.storeDefaultRole.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const sdr of sourceDefaultRoles) {
    const newRoleId = roleIdMap.get(sdr.roleId);
    if (!newRoleId) continue;

    await prisma.storeDefaultRole.create({
      data: {
        storeId: NEW_STORE_ID,
        roleId: newRoleId,
      },
    });
  }
  console.log(`✓ ${sourceDefaultRoles.length} store default roles cloned`);

  // ── 9. Clone RoleFairnessTrackers ──
  const sourceTrackers = await prisma.roleFairnessTracker.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const t of sourceTrackers) {
    const newRoleId = roleIdMap.get(t.roleId);
    if (!newRoleId) continue;

    await prisma.roleFairnessTracker.create({
      data: {
        storeId: NEW_STORE_ID,
        roleId: newRoleId,
        lookbackDays: t.lookbackDays,
        enabled: t.enabled,
      },
    });
  }
  console.log(`✓ ${sourceTrackers.length} fairness trackers cloned`);

  // ── 10. Clone Shifts ──
  const sourceShifts = await prisma.shift.findMany({ where: { storeId: SOURCE_STORE_ID } });

  for (const s of sourceShifts) {
    const newCrewId = crewIdMap.get(s.crewId);
    if (!newCrewId) continue;

    await prisma.shift.create({
      data: {
        date: s.date,
        crewId: newCrewId,
        storeId: NEW_STORE_ID,
        startMin: s.startMin,
        endMin: s.endMin,
      },
    });
  }
  console.log(`✓ ${sourceShifts.length} shifts cloned`);

  // ── 11. Clone RoleCoverageWindows ──
  const sourceCoverage = await prisma.roleCoverageWindow.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const cw of sourceCoverage) {
    const newRoleId = roleIdMap.get(cw.roleId);
    if (!newRoleId) continue;

    await prisma.roleCoverageWindow.create({
      data: {
        date: cw.date,
        startMin: cw.startMin,
        endMin: cw.endMin,
        crewPerMinute: cw.crewPerMinute,
        storeId: NEW_STORE_ID,
        roleId: newRoleId,
        constraintRule: cw.constraintRule,
      },
    });
  }
  console.log(`✓ ${sourceCoverage.length} coverage windows cloned`);

  // ── 12. Clone CrewRoleQuotas ──
  const sourceQuotas = await prisma.crewRoleQuota.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const q of sourceQuotas) {
    const newCrewId = crewIdMap.get(q.crewId);
    const newRoleId = roleIdMap.get(q.roleId);
    if (!newCrewId || !newRoleId) continue;

    await prisma.crewRoleQuota.create({
      data: {
        date: q.date,
        startMin: q.startMin,
        endMin: q.endMin,
        requiredMin: q.requiredMin,
        storeId: NEW_STORE_ID,
        crewId: newCrewId,
        roleId: newRoleId,
      },
    });
  }
  console.log(`✓ ${sourceQuotas.length} crew role quotas cloned`);

  // ── 13. Clone Logbooks + Assignments + LogPreferenceMetadata ──
  const sourceLogbooks = await prisma.logbook.findMany({
    where: { storeId: SOURCE_STORE_ID },
    include: {
      Assignment: true,
      LogPreferenceMetadata: true,
    },
    orderBy: { generatedAt: 'asc' },
  });

  const logbookIdMap = new Map<string, string>();

  for (const lb of sourceLogbooks) {
    const newLogbookId = randomUUID();
    logbookIdMap.set(lb.id, newLogbookId);

    const newSupersededById = lb.supersededById ? logbookIdMap.get(lb.supersededById) ?? null : null;

    await prisma.logbook.create({
      data: {
        id: newLogbookId,
        date: lb.date,
        storeId: NEW_STORE_ID,
        status: lb.status,
        generatedAt: lb.generatedAt,
        storedFilePath: lb.storedFilePath,
        metadata: lb.metadata ?? undefined,
        supersededById: newSupersededById,
        createdByName: lb.createdByName,
        publishedAt: lb.publishedAt,
      },
    });

    // Clone assignments for this logbook
    for (const a of lb.Assignment) {
      const newCrewId = crewIdMap.get(a.crewId);
      const newRoleId = roleIdMap.get(a.roleId);
      if (!newCrewId || !newRoleId) continue;

      await prisma.assignment.create({
        data: {
          id: randomUUID(),
          logbookId: newLogbookId,
          crewId: newCrewId,
          roleId: newRoleId,
          startTime: a.startTime,
          endTime: a.endTime,
          origin: a.origin,
          locked: a.locked,
        },
      });
    }

    // Clone preference metadata
    if (lb.LogPreferenceMetadata) {
      const lpm = lb.LogPreferenceMetadata;
      await prisma.logPreferenceMetadata.create({
        data: {
          id: randomUUID(),
          logbookId: newLogbookId,
          eligiblePreferences: lpm.eligiblePreferences,
          preferencesMet: lpm.preferencesMet,
          percentMet: lpm.percentMet,
          avgSatisfaction: lpm.avgSatisfaction,
          eligibleCrew: lpm.eligibleCrew,
          avgSatisfactionPerCrew: lpm.avgSatisfactionPerCrew,
          fairnessIndex: lpm.fairnessIndex,
          fairnessGrade: lpm.fairnessGrade,
          breakdownByRoleRule: lpm.breakdownByRoleRule ?? undefined,
          breakdownByCrew: lpm.breakdownByCrew ?? undefined,
          breakdownByCrewAndRuleType: lpm.breakdownByCrewAndRuleType ?? undefined,
        },
      });
    }
  }

  const assignmentCount = sourceLogbooks.reduce((sum, lb) => sum + lb.Assignment.length, 0);
  console.log(`✓ ${sourceLogbooks.length} logbooks + ${assignmentCount} assignments cloned`);

  // ── 14. Clone Runs ──
  const sourceRuns = await prisma.run.findMany({ where: { storeId: SOURCE_STORE_ID } });

  for (const r of sourceRuns) {
    const newLogbookId = r.logbookId ? logbookIdMap.get(r.logbookId) ?? null : null;

    await prisma.run.create({
      data: {
        id: randomUUID(),
        date: r.date,
        storeId: NEW_STORE_ID,
        engine: r.engine,
        seed: r.seed,
        status: r.status,
        runtimeMs: r.runtimeMs,
        violations: r.violations ?? undefined,
        objectiveScore: r.objectiveScore,
        mipGap: r.mipGap,
        logbookId: newLogbookId,
        inputParams: r.inputParams ?? undefined,
        solverVersion: r.solverVersion,
        triggeredBy: r.triggeredBy,
        inputHash: r.inputHash,
        constraintCount: r.constraintCount,
        variableCount: r.variableCount,
      },
    });
  }
  console.log(`✓ ${sourceRuns.length} runs cloned`);

  // ── 15. Clone CrewRoleFairnessHistory ──
  const sourceHistory = await prisma.crewRoleFairnessHistory.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const h of sourceHistory) {
    const newCrewId = crewIdMap.get(h.crewId);
    const newRoleId = roleIdMap.get(h.roleId);
    if (!newCrewId || !newRoleId) continue;

    await prisma.crewRoleFairnessHistory.create({
      data: {
        storeId: NEW_STORE_ID,
        roleId: newRoleId,
        crewId: newCrewId,
        date: h.date,
        minutesAssigned: h.minutesAssigned,
      },
    });
  }
  console.log(`✓ ${sourceHistory.length} fairness history records cloned`);

  // ── 16. Clone RoleFairnessSnapshots ──
  const sourceSnapshots = await prisma.roleFairnessSnapshot.findMany({
    where: { storeId: SOURCE_STORE_ID },
  });

  for (const s of sourceSnapshots) {
    const newRoleId = roleIdMap.get(s.roleId);
    if (!newRoleId) continue;

    await prisma.roleFairnessSnapshot.create({
      data: {
        storeId: NEW_STORE_ID,
        roleId: newRoleId,
        date: s.date,
        giniCoefficient: s.giniCoefficient,
        fairnessIndex: s.fairnessIndex,
        fairnessGrade: s.fairnessGrade,
        minMinutesPerDay: s.minMinutesPerDay,
        maxMinutesPerDay: s.maxMinutesPerDay,
        avgMinutesPerDay: s.avgMinutesPerDay,
        stdDeviation: s.stdDeviation,
        eligibleCrew: s.eligibleCrew,
        crewWithMinutes: s.crewWithMinutes,
        lookbackDays: s.lookbackDays,
      },
    });
  }
  console.log(`✓ ${sourceSnapshots.length} fairness snapshots cloned`);

  // ── 17. Create demo user ──
  const existingUser = await prisma.user.findUnique({ where: { username: DEMO_USERNAME } });
  if (existingUser) {
    console.log(`\n⚠ Demo user "${DEMO_USERNAME}" already exists, skipping creation.`);
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const user = await prisma.user.create({
      data: {
        username: DEMO_USERNAME,
        passwordHash,
        name: 'Demo User',
        role: 'CAPTAIN',
        storeId: NEW_STORE_ID,
        crewId: null,
      },
    });
    console.log(`\n✓ Demo user created: ${user.username} (${user.role}) → store ${NEW_STORE_ID}`);
  }

  console.log(`\nDone! Store "${NEW_STORE_NAME}" (${NEW_STORE_ID}) is ready.`);
  console.log(`Login with: username="${DEMO_USERNAME}" password="${DEMO_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
