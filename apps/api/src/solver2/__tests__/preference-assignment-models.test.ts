import { describe, expect, it } from 'vitest';
import { ConsecutivePolicy } from '@prisma/client';
import type { RoleDescriptor } from '../types';
import { resolvePreferenceAssignmentModels } from '../preference-assignment-models';

function buildRole(overrides: Partial<RoleDescriptor> = {}): RoleDescriptor {
  return {
    id: 1,
    code: 'REG',
    displayName: 'Register',
    assignmentModels: ['HOURLY'],
    minSlots: 0,
    maxSlots: 10,
    blockSize: 1,
    allowOutsideStoreHours: false,
    consecutivePolicy: ConsecutivePolicy.NONE,
    minShiftLengthForRoleAccess: null,
    ...overrides,
  };
}

function buildLookup(roles: RoleDescriptor[]): Map<number, RoleDescriptor> {
  return new Map(roles.map((role) => [role.id, role]));
}

describe('resolvePreferenceAssignmentModels', () => {
  it('returns an empty list when the preference has no roleId', () => {
    const lookup = buildLookup([buildRole()]);
    const models = resolvePreferenceAssignmentModels(null, lookup);
    expect(models).toEqual([]);
  });

  it('defaults to HOURLY when the role advertises no models', () => {
    const lookup = buildLookup([
      buildRole({ id: 2, assignmentModels: [] }),
    ]);
    const models = resolvePreferenceAssignmentModels(2, lookup);
    expect(models).toEqual(['HOURLY']);
  });

  it('returns the declared assignment models for the role', () => {
    const lookup = buildLookup([
      buildRole({ id: 3, assignmentModels: ['SOLVER'] }),
    ]);
    const models = resolvePreferenceAssignmentModels(3, lookup);
    expect(models).toEqual(['SOLVER']);
  });
});
