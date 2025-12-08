import { describe, it, expect } from 'vitest';
import { PreferenceType } from '@logbook-writer/shared-types';
import { ConsecutivePolicy } from '@prisma/client';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid, minutesToSlotIndex } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageModel } from '../milp-model';
import { buildObjective } from '../objective-builder';
import type { PreferenceDescriptor, AssignmentModelValue } from '../types';

const getFairnessMinStdDev = () => {
  const parsed = Number(process.env.FAIRNESS_MIN_STD_DEV ?? '60');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
};

const buildPreferences = (overrides: Partial<PreferenceDescriptor>): PreferenceDescriptor => ({
  crewId: 'crew-alpha',
  roleId: 1,
  preferenceType: PreferenceType.FIRST_HOUR,
  baseWeight: 10,
  crewWeight: 2,
  adaptiveBoost: 1,
  intValue: undefined,
  rolePreferenceId: 100,
  assignmentModels: ['HOURLY'],
  ...overrides,
});

describe('objective-builder', () => {
  it('creates preference terms for first-hour and favorite preferences', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);

    const firstHourCandidate = roleSlotVariables.find((variable) => {
      const crew = sampleInput.crew.find((member) => member.id === variable.crewId);
      if (!crew) {
        return false;
      }
      const shiftStartSlot = minutesToSlotIndex(crew.shiftStartMin, grid, 'floor');
      return variable.slotIndex === shiftStartSlot;
    });

    expect(firstHourCandidate).toBeDefined();

    const candidateRole = sampleInput.roles.find((role) => role.id === firstHourCandidate?.roleId);
    expect(candidateRole).toBeDefined();

    const preferences: PreferenceDescriptor[] = [
      buildPreferences({
        crewId: firstHourCandidate!.crewId,
        roleId: firstHourCandidate!.roleId,
        preferenceType: PreferenceType.FIRST_HOUR,
        baseWeight: 5,
        crewWeight: 3,
        rolePreferenceId: 101,
        assignmentModels: candidateRole!.assignmentModels,
      }),
      buildPreferences({
        crewId: 'crew-beta',
        roleId: 3,
        preferenceType: PreferenceType.FAVORITE,
        baseWeight: 2,
        crewWeight: 4,
        rolePreferenceId: 102,
      }),
    ];

    const { preferenceTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences,
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      fairnessHistory: [],
    });

    expect(preferenceTerms.length).toBeGreaterThan(0);

    const firstHourTerm = preferenceTerms.find(
      (term) => term.family === 'PREFERENCE' && 'kind' in term.metadata && term.metadata.kind === 'FIRST_HOUR'
    );
    expect(firstHourTerm?.coefficient).toBe(5 * 3);
    expect((firstHourTerm?.metadata as any).rolePreferenceId).toBe(101);

    const favoriteTerms = preferenceTerms.filter(
      (term) => term.family === 'PREFERENCE' && 'kind' in term.metadata && term.metadata.kind === 'FAVORITE'
    );
    expect(favoriteTerms.length).toBeGreaterThan(1);
    expect(favoriteTerms.every((term) => term.coefficient === 2 * 4)).toBe(true);
  });

  it('scales timing preferences within the role window offsets', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);

    const preferences: PreferenceDescriptor[] = [
      buildPreferences({
        crewId: 'crew-alpha',
        roleId: 2,
        preferenceType: PreferenceType.TIMING,
        baseWeight: 4,
        crewWeight: 1,
        adaptiveBoost: 1,
        intValue: 1,
        rolePreferenceId: 201,
        assignmentModels: ['SOLVER'],
      }),
    ];

    const { preferenceTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences,
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      fairnessHistory: [],
    });

    const timingTerms = preferenceTerms.filter(
      (term) => term.family === 'PREFERENCE' && 'kind' in term.metadata && term.metadata.kind === 'TIMING'
    );

    expect(timingTerms.length).toBeGreaterThan(0);
    const coefficients = timingTerms.map((term) => term.coefficient);
    expect(Math.max(...coefficients)).toBeGreaterThan(Math.min(...coefficients));
    expect(
      timingTerms.every(
        (term) =>
          (term.metadata as any).timingPreference === 'LATE' &&
          typeof (term.metadata as any).normalizedPosition === 'number'
      )
    ).toBe(true);
  });

  it('creates signed consecutive penalties for consecutive preferences', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);

    const preferences: PreferenceDescriptor[] = [
      buildPreferences({
        crewId: 'crew-alpha',
        roleId: 1,
        preferenceType: PreferenceType.CONSECUTIVE,
        intValue: 1,
        baseWeight: 3,
        crewWeight: 2,
        rolePreferenceId: 301,
      }),
      buildPreferences({
        crewId: 'crew-beta',
        roleId: 1,
        preferenceType: PreferenceType.CONSECUTIVE,
        intValue: -1,
        baseWeight: 2,
        crewWeight: 2,
        rolePreferenceId: 302,
      }),
    ];

    const { consecutiveTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences,
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      fairnessHistory: [],
    });

    const contiguousTerms = consecutiveTerms.filter(
      (term) => term.family === 'CONSECUTIVE' && (term.metadata as any).source === 'PREFERENCE_CONTIGUOUS'
    );
    expect(contiguousTerms.length).toBeGreaterThan(0);
    expect(contiguousTerms.every((term) => term.coefficient < 0)).toBe(true);

    const switchTerms = consecutiveTerms.filter(
      (term) => term.family === 'CONSECUTIVE' && (term.metadata as any).source === 'PREFERENCE_SWITCH'
    );
    expect(switchTerms.length).toBeGreaterThan(0);
    expect(switchTerms.every((term) => term.coefficient > 0)).toBe(true);
  });

  it('skips preference terms when assignment models are not slot based', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);

    const preferences: PreferenceDescriptor[] = [
      buildPreferences({
        assignmentModels: ['DAILY'] as AssignmentModelValue[],
        rolePreferenceId: 401,
      }),
    ];

    const { preferenceTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences,
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      fairnessHistory: [],
    });

    expect(preferenceTerms).toHaveLength(0);
  });

  it('adds role policy penalties when consecutive policy is preferred', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);
    const roles = sampleInput.roles.map((role, index) =>
      index === 0 ? { ...role, consecutivePolicy: ConsecutivePolicy.PREFERRED } : { ...role }
    );

    const { consecutiveTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences: [],
      crew: sampleInput.crew,
      roles,
      grid,
      fairnessHistory: [],
    });

    expect(consecutiveTerms.length).toBeGreaterThan(0);
    expect(
      consecutiveTerms.some((term) => (term.metadata as any).source === 'ROLE_POLICY')
    ).toBe(true);
  });
  
  it('adds fairness penalties for tracked roles with surplus history minutes', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);
    const roles = sampleInput.roles.map((role) => ({ ...role }));
    roles[0] = {
      ...roles[0],
      fairnessTracking: { enabled: true, lookbackDays: 14 } as any,
    };
    const windowStart = new Date('2025-01-01T00:00:00Z');
    const windowEnd = new Date('2025-01-14T00:00:00Z');
    const fairnessHistory = [
      {
        roleId: 1,
        crewId: 'crew-alpha',
        storeId: 1,
        minutesAssigned: 300,
        windowStart,
        windowEnd,
        lookbackDays: 14,
      },
      {
        roleId: 1,
        crewId: 'crew-beta',
        storeId: 1,
        minutesAssigned: 0,
        windowStart,
        windowEnd,
        lookbackDays: 14,
      },
    ];

    const { fairnessTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences: [],
      crew: sampleInput.crew,
      roles,
      grid,
      fairnessHistory,
    });

    expect(fairnessTerms.length).toBeGreaterThan(0);
    expect(
      fairnessTerms.every((term) => term.family === 'FAIRNESS' && term.coefficient > 0)
    ).toBe(true);
    const fairnessCrewIds = fairnessTerms.map((term) => (term.metadata as any).crewId);
    expect(fairnessCrewIds).toContain('crew-alpha');

    const crewMinutes = [300, 0];
    const average = crewMinutes.reduce((sum, value) => sum + value, 0) / crewMinutes.length;
    const variance =
      crewMinutes.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
      crewMinutes.length;
    const stdDev = Math.sqrt(variance);
    const expectedZScore = (crewMinutes[0] - average) / Math.max(stdDev, getFairnessMinStdDev());

    expect(
      fairnessTerms.every((term) =>
        Math.abs((term.metadata as any).zScore - expectedZScore) < 1e-6
      )
    ).toBe(true);

    const ratio = fairnessTerms[0].coefficient / (fairnessTerms[0].metadata as any).zScore;
    expect(ratio).toBeGreaterThan(0);
    expect(
      fairnessTerms.every(
        (term) =>
          Math.abs(
            term.coefficient / (term.metadata as any).zScore - ratio
          ) < 1e-6
      )
    ).toBe(true);
  });

  it('skips fairness penalties when fairness tracking is disabled', () => {
    const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const modelResult = buildCoverageModel(roleSlotVariables);
    const fairnessHistory = [
      {
        roleId: 1,
        crewId: 'crew-alpha',
        storeId: 1,
        minutesAssigned: 300,
        windowStart: new Date('2025-01-01T00:00:00Z'),
        windowEnd: new Date('2025-01-14T00:00:00Z'),
        lookbackDays: 14,
      },
    ];

    const { fairnessTerms } = buildObjective({
      modelResult,
      roleSlotVariables,
      preferences: [],
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      fairnessHistory,
    });

    expect(fairnessTerms).toHaveLength(0);
  });
});
