// Translates consecutive gap penalty descriptors into linear constraints plus
// matching objective terms so the CP model can reward or discourage slot gaps.
import type { ConsecutiveGapPenalty } from './consecutive-policy-penalties';
import {
  getVariableHandleKey,
  type BuildModelResult,
  type ObjectiveTerm,
  type VariableHandle,
} from './milp-model';

function getExistingHandle(modelResult: BuildModelResult, key: string): VariableHandle | undefined {
  return modelResult.variableHandles.get(key);
}

function getOrCreateGapHandle(modelResult: BuildModelResult, key: string): VariableHandle {
  const existing = getExistingHandle(modelResult, key);
  if (existing) {
    return existing;
  }
  const cpVar = modelResult.model.newBoolVar(key);
  const handle: VariableHandle = { key, cpVar };
  modelResult.variableHandles.set(key, handle);
  return handle;
}

export function attachConsecutivePolicyPenalties(
  modelResult: BuildModelResult,
  penalties: ConsecutiveGapPenalty[]
): ObjectiveTerm[] {
  const attachedTerms: ObjectiveTerm[] = [];
  if (!penalties.length) {
    return attachedTerms;
  }

  for (const penalty of penalties) {
    const [firstVar, secondVar] = penalty.variables;
    const firstHandle = getExistingHandle(modelResult, getVariableHandleKey(firstVar));
    const secondHandle = getExistingHandle(modelResult, getVariableHandleKey(secondVar));

    if (!firstHandle || !secondHandle) {
      throw new Error('Missing variable handle for consecutive penalty variable');
    }

    const gapKey = `consecutive-gap:${penalty.crewId}:${penalty.roleId}:${penalty.slotPair[0]}-${penalty.slotPair[1]}`;
    const gapHandle = getOrCreateGapHandle(modelResult, gapKey);

    const baseMetadata = {
      crewId: penalty.crewId,
      roleId: penalty.roleId,
      slotIndexes: [penalty.slotPair[0], penalty.slotPair[1]] as number[],
      source: penalty.source ?? 'ROLE_POLICY',
      rolePreferenceId: penalty.rolePreferenceId,
      preferenceType: penalty.preferenceType,
    };

    modelResult.model.addLinearConstraint({
      family: 'CONSECUTIVE',
      relation: 'GE',
      metadata: {
        ...baseMetadata,
        kind: 'PREFERRED_GAP_POSITIVE',
      },
      rhs: 0,
      coefficients: [
        { key: gapHandle.key, cpVar: gapHandle.cpVar, coefficient: 1 },
        { key: firstHandle.key, cpVar: firstHandle.cpVar, coefficient: -1 },
        { key: secondHandle.key, cpVar: secondHandle.cpVar, coefficient: 1 },
      ],
    });

    modelResult.model.addLinearConstraint({
      family: 'CONSECUTIVE',
      relation: 'GE',
      metadata: {
        ...baseMetadata,
        kind: 'PREFERRED_GAP_NEGATIVE',
      },
      rhs: 0,
      coefficients: [
        { key: gapHandle.key, cpVar: gapHandle.cpVar, coefficient: 1 },
        { key: firstHandle.key, cpVar: firstHandle.cpVar, coefficient: 1 },
        { key: secondHandle.key, cpVar: secondHandle.cpVar, coefficient: -1 },
      ],
    });

    const term: ObjectiveTerm = {
      family: 'CONSECUTIVE',
      metadata: {
        crewId: penalty.crewId,
        roleId: penalty.roleId,
        slotPair: penalty.slotPair,
        source: penalty.source ?? 'ROLE_POLICY',
        rolePreferenceId: penalty.rolePreferenceId,
        preferenceType: penalty.preferenceType,
      },
      coefficient: -penalty.weight,
      key: gapHandle.key,
      cpVar: gapHandle.cpVar,
    };

    modelResult.model.addObjectiveTerm(term);
    attachedTerms.push(term);
  }

  return attachedTerms;
}
