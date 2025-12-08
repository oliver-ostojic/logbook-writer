import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';

describe('role slot variable generation', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);

  it('creates variables for every eligible crew/role slot', () => {
    const variables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
    const registerVars = variables.filter((v) => v.roleId === 1);
    const breakVars = variables.filter((v) => v.roleId === 2);

    // Crew alpha: register role should be clamped to store hours (slots 6-15).
    const alphaRegister = registerVars.filter((v) => v.crewId === 'crew-alpha');
    expect(alphaRegister.length).toBe(10);
    expect(alphaRegister[0].slotIndex).toBe(6);
    expect(alphaRegister.at(-1)?.slotIndex).toBe(15);

  // Crew beta: register role spans from slot 10 (10am) through store close slot 31.
    const betaRegister = registerVars.filter((v) => v.crewId === 'crew-beta');
  expect(betaRegister.length).toBe(22);
    expect(betaRegister[0].slotIndex).toBe(10);
  expect(betaRegister.at(-1)?.slotIndex).toBe(31);

    // Break role only available to crew-alpha due to eligibility metadata.
    expect(breakVars.length).toBe(4);
    expect(breakVars.every((v) => v.crewId === 'crew-alpha')).toBe(true);
  });

  it('throws when a crew references a missing role', () => {
    const invalidCrew = [
      {
        ...sampleInput.crew[0],
        roleIds: [9999],
      },
    ];

    expect(() => buildRoleSlotVariables(invalidCrew, sampleInput.roles, grid)).toThrow(
      /Role 9999 referenced/
    );
  });
});
