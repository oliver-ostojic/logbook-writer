import { describe, it, expect } from 'vitest';
import { PreferenceType } from '@logbook-writer/shared-types';
import sampleInput from '../__fixtures__/sampleInput';
import { buildAssignmentModel } from '../model-builder';
import type { AssignmentModelValue, PreferenceDescriptor, SolverInputV2 } from '../types';

const cloneInput = (): SolverInputV2 => ({
  store: { ...sampleInput.store },
  roles: sampleInput.roles.map((role) => ({ ...role })),
  crew: sampleInput.crew.map((crew) => ({ ...crew })),
  hourlyRequirements: sampleInput.hourlyRequirements.map((req) => ({ ...req })),
  windowRequirements: sampleInput.windowRequirements.map((req) => ({ ...req })),
  dailyRequirements: sampleInput.dailyRequirements.map((req) => ({ ...req })),
  preferences: sampleInput.preferences.map((pref) => ({ ...pref })),
  bankedPreferences: sampleInput.bankedPreferences.map((pref) => ({ ...pref })),
  fairnessTrackers: sampleInput.fairnessTrackers.map((tracker) => ({ ...tracker })),
  fairnessHistory: sampleInput.fairnessHistory.map((entry) => ({ ...entry })),
});

const buildPreference = (overrides: Partial<PreferenceDescriptor> = {}): PreferenceDescriptor => ({
  crewId: 'crew-alpha',
  roleId: 1,
  preferenceType: PreferenceType.FAVORITE,
  baseWeight: 2,
  crewWeight: 1,
  adaptiveBoost: 1,
  rolePreferenceId: 100,
  assignmentModels: ['HOURLY'] as AssignmentModelValue[],
  ...overrides,
});

describe('model-builder', () => {
  it('attaches preference + consecutive objective terms during assembly', () => {
    const input = cloneInput();
    input.preferences = [
      buildPreference({
        rolePreferenceId: 101,
        preferenceType: PreferenceType.FAVORITE,
      }),
      buildPreference({
        rolePreferenceId: 102,
        preferenceType: PreferenceType.CONSECUTIVE,
        intValue: 1,
      }),
    ];

    const result = buildAssignmentModel(input);

    expect(result.objective.preferenceTerms.length).toBeGreaterThan(0);
    expect(result.objective.consecutiveTerms.length).toBeGreaterThan(0);
    expect(result.modelResult.model.getObjectiveTerms()).toHaveLength(
      result.objective.preferenceTerms.length + result.objective.consecutiveTerms.length
    );
  });

  it('builds the core constraint families before returning', () => {
    const result = buildAssignmentModel(cloneInput());

    expect(result.constraints.coverage.length).toBeGreaterThan(0);
    expect(result.constraints.perSlot.length).toBeGreaterThan(0);
    expect(result.constraints.blockSize.length).toBeGreaterThan(0);
    expect(result.constraints.roleTotals.length).toBeGreaterThan(0);
    expect(result.constraints.consecutive.length).toBeGreaterThanOrEqual(0);
    expect(result.modelResult.model.getAllConstraints().length).toBeGreaterThan(0);
  });
});
