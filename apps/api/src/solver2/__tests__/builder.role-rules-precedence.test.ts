import { describe, expect, it } from 'vitest';

// This test captures the strict precedence semantics implemented in `solver2/builder.ts`.
// We keep it DB-free and focus only on the rule-resolution behavior.

type RoleRule = {
  id: number;
  roleId: number;
  type: string;
  targetRoleId: number | null;
};

type StoreRoleRuleRecord = {
  id: number;
  isPriority: boolean;
  valueInt: number | null;
  RoleRule: RoleRule;
};

type CrewRoleRuleRecord = {
  id: number;
  crewId: string;
  isPriority: boolean;
  valueInt: number | null;
  RoleRule: RoleRule;
};

type EmittedRule = {
  id: number;
  roleRuleId: number;
  roleId: number;
  type: string;
  targetRoleId: number | null;
  valueInt: number | null;
  crewId: string;
  isPriority: boolean;
  source: 'store' | 'crew';
};

const ruleBaseKey = (roleId: number, type: string, targetRoleId: number | null) => `${roleId}:${type}:${targetRoleId ?? 'null'}`;

function resolveRoleRulesStrictPriorityOnly(params: {
  crewIds: string[];
  storeRules: StoreRoleRuleRecord[];
  crewRules: CrewRoleRuleRecord[];
}): EmittedRule[] {
  const { crewIds, storeRules, crewRules } = params;

  const storeRulesByBaseKey = new Map<string, StoreRoleRuleRecord[]>();
  for (const storeRule of storeRules) {
    const { roleId, type, targetRoleId } = storeRule.RoleRule;
    const k = ruleBaseKey(roleId, type, targetRoleId);
    const arr = storeRulesByBaseKey.get(k) ?? [];
    arr.push(storeRule);
    storeRulesByBaseKey.set(k, arr);
  }

  const crewRulesByCrewAndBaseKey = new Map<string, Map<string, CrewRoleRuleRecord[]>>();
  for (const crewRule of crewRules) {
    const { roleId, type, targetRoleId } = crewRule.RoleRule;
    const k = ruleBaseKey(roleId, type, targetRoleId);

    if (!crewRulesByCrewAndBaseKey.has(crewRule.crewId)) {
      crewRulesByCrewAndBaseKey.set(crewRule.crewId, new Map());
    }

    const inner = crewRulesByCrewAndBaseKey.get(crewRule.crewId)!;
    const arr = inner.get(k) ?? [];
    arr.push(crewRule);
    inner.set(k, arr);
  }

  const allBaseKeys = new Set<string>();
  for (const k of storeRulesByBaseKey.keys()) allBaseKeys.add(k);
  for (const inner of crewRulesByCrewAndBaseKey.values()) {
    for (const k of inner.keys()) allBaseKeys.add(k);
  }

  const out: EmittedRule[] = [];

  for (const crewId of crewIds) {
    const crewMap = crewRulesByCrewAndBaseKey.get(crewId);

    for (const baseKey of allBaseKeys) {
      const crewForKey = crewMap?.get(baseKey) ?? [];
      const storeForKey = storeRulesByBaseKey.get(baseKey) ?? [];

      if (crewForKey.length > 0) {
        // Crew overrides store for this base key.
        for (const rec of crewForKey.filter((r) => r.isPriority)) {
          const rr = rec.RoleRule;
          out.push({
            id: rec.id,
            roleRuleId: rr.id,
            roleId: rr.roleId,
            type: rr.type,
            targetRoleId: rr.targetRoleId,
            valueInt: rec.valueInt,
            crewId,
            isPriority: rec.isPriority,
            source: 'crew',
          });
        }
        continue;
      }

      // No crew rules at all → emit store priority rules.
      for (const rec of storeForKey.filter((r) => r.isPriority)) {
        const rr = rec.RoleRule;
        out.push({
          id: rec.id,
          roleRuleId: rr.id,
          roleId: rr.roleId,
          type: rr.type,
          targetRoleId: rr.targetRoleId,
          valueInt: rec.valueInt,
          crewId,
          isPriority: rec.isPriority,
          source: 'store',
        });
      }
    }
  }

  return out;
}

describe('solver2 builder roleRules precedence (strict priority-only)', () => {
  it('uses crew priority override and suppresses store defaults even when valueInt differs', () => {
    const REG_ROLE_ID = 30;
    const ROLE_RULE_ID = 6;

    const storeRules: StoreRoleRuleRecord[] = [
      {
        id: 7,
        isPriority: true,
        valueInt: 60,
        RoleRule: {
          id: ROLE_RULE_ID,
          roleId: REG_ROLE_ID,
          type: 'MAX_CONSECUTIVE_MINUTES',
          targetRoleId: null,
        },
      },
    ];

    const crewRules: CrewRoleRuleRecord[] = [
      {
        id: 776,
        crewId: '1287114',
        isPriority: true,
        valueInt: 180,
        RoleRule: {
          id: ROLE_RULE_ID,
          roleId: REG_ROLE_ID,
          type: 'MAX_CONSECUTIVE_MINUTES',
          targetRoleId: null,
        },
      },
    ];

    const emitted = resolveRoleRulesStrictPriorityOnly({
      crewIds: ['1287114'],
      storeRules,
      crewRules,
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      crewId: '1287114',
      source: 'crew',
      roleRuleId: ROLE_RULE_ID,
      roleId: REG_ROLE_ID,
      type: 'MAX_CONSECUTIVE_MINUTES',
      valueInt: 180,
      isPriority: true,
    });
  });

  it('falls back to store priority rules when crew has no rules for that base key', () => {
    const REG_ROLE_ID = 30;
    const ROLE_RULE_ID = 6;

    const storeRules: StoreRoleRuleRecord[] = [
      {
        id: 7,
        isPriority: true,
        valueInt: 60,
        RoleRule: {
          id: ROLE_RULE_ID,
          roleId: REG_ROLE_ID,
          type: 'MAX_CONSECUTIVE_MINUTES',
          targetRoleId: null,
        },
      },
    ];

    const emitted = resolveRoleRulesStrictPriorityOnly({
      crewIds: ['someone'],
      storeRules,
      crewRules: [],
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      crewId: 'someone',
      source: 'store',
      roleRuleId: ROLE_RULE_ID,
      roleId: REG_ROLE_ID,
      type: 'MAX_CONSECUTIVE_MINUTES',
      valueInt: 60,
      isPriority: true,
    });
  });
});
