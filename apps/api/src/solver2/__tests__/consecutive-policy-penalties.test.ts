import { describe, it, expect } from 'vitest';
import { ConsecutivePolicy } from '@prisma/client';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildConsecutivePolicyGapPenalties } from '../consecutive-policy-penalties';

const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);

describe('consecutive policy penalties', () => {
  it('emits adjacency penalties for preferred roles using role weight multipliers', () => {
    const preferredRoles = sampleInput.roles.map((role) =>
      role.id === 3
        ? {
            ...role,
            consecutivePolicy: 'PREFERRED' as ConsecutivePolicy,
          }
        : role
    );

    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, preferredRoles, grid);
    const penalties = buildConsecutivePolicyGapPenalties({
      roles: preferredRoles,
      roleSlotVariables,
    });

    const preferredPenalties = penalties.filter((penalty) => penalty.roleId === 3);
    expect(preferredPenalties.length).toBeGreaterThan(0);
  expect(preferredPenalties.every((penalty) => penalty.weight === 500)).toBe(true);
    expect(preferredPenalties.every((penalty) => penalty.slotPair[1] - penalty.slotPair[0] === 1)).toBe(true);
  });

  it('skips roles without preferred policy or weight', () => {
    const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const penalties = buildConsecutivePolicyGapPenalties({
      roles: sampleInput.roles,
      roleSlotVariables,
    });

    expect(penalties).toHaveLength(0);
  });
});
